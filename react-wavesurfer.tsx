/* eslint-disable complexity */

import * as _ from "lodash";
import * as PropTypes from "prop-types";
import * as React from "react";

const EVENTS = [
    "audioprocess",
    "error",
    "finish",
    "loading",
    "mouseup",
    "pause",
    "play",
    "ready",
    "scroll",
    "seek",
    "zoom",
];

/**
 * @description Capitalise the first letter of a string
 */
function capitaliseFirstLetter(str: string): string {
    return str
        .split("-")
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

/**
 * @description Throws an error if the prop is defined and not an integer or not positive
 */
function positiveIntegerProptype(props: any, propName: any, componentName: any) {
    const n = props[propName];
    if (n !== undefined && (typeof n !== "number" || n < 0)) {
        return new Error(`Invalid ${propName} supplied to ${componentName}, expected a positive integer`);
    }

    return null;
}

const resizeThrottler = (fn: () => void) => () => {
    let resizeTimeout;

    if (!resizeTimeout) {
        resizeTimeout = setTimeout(() => {
            resizeTimeout = null;
            fn();
        }, 66);
    }
};

const WaveSurfer = (window as any).WaveSurfer;

class Wavesurfer extends React.Component<any, any> {

    public static propTypes: any;
    public static defaultProps: any;

    private wavesurfer: any;
    private wavesurferEl: any;

    public constructor(props: any) {
        super(props);

        this.state = {
            isReady: false,
        };

        this.wavesurfer = Object.create(WaveSurfer);
        this.loadMediaElt = this.loadMediaElt.bind(this);
        this.loadAudio = this.loadAudio.bind(this);
        this.seekTo = this.seekTo.bind(this);

        if (this.props.responsive) {
            this.handleResize = resizeThrottler(() => {
                // pause playback for resize operation
                if (this.props.playing) {
                    this.wavesurfer.pause();
                }

                // resize the waveform
                this.wavesurfer.drawBuffer();

                // We allow resize before file isloaded, since we can get wave data from outside,
                // so there might not be a file loaded when resizing
                if (this.state.isReady) {
                    // restore previous position
                    this.seekTo(this.props.pos);
                }

                // restore playback
                if (this.props.playing) {
                    this.wavesurfer.play();
                }
            });
        }
    }

    public render() {
        const childrenWithProps = this.props.children
            ? React.Children.map(this.props.children, (child: any) =>
                React.cloneElement(child, {
                    isReady: this.state.isReady,
                    wavesurfer: this.wavesurfer,
                }),
            ) : false;
        return (
            <div>
                <div
                    ref={(c) => {
                        this.wavesurferEl = c;
                    }}
                />
                {childrenWithProps}
            </div>
        );
    }

    public componentDidMount() {
        const options = _.merge(this.props.options, {
            container: this.wavesurferEl,
        });

        // media element loading is only supported by MediaElement backend
        if (this.props.mediaElt) {
            options.backend = "MediaElement";
        }

        this.wavesurfer.init(options);

        // file was loaded, wave was drawn
        this.wavesurfer.on("ready", () => {
            this.setState({
                isReady: true,
                pos: this.props.pos,
            });

            // set initial position
            if (this.props.pos) {
                this.seekTo(this.props.pos);
            }

            // set initial volume
            if (this.props.volume) {
                this.wavesurfer.setVolume(this.props.volume);
            }

            // set initial playing state
            if (this.props.playing) {
                this.wavesurfer.play();
            }

            // set initial zoom
            if (this.props.zoom) {
                this.wavesurfer.zoom(this.props.zoom);
            }
        });

        this.wavesurfer.on("audioprocess", (pos: any) => {
            this.setState({
                pos,
            });
            this.props.onPosChange({
                originalArgs: [pos],
                wavesurfer: this.wavesurfer,
            });
        });

        // `audioprocess` is not fired when seeking, so we have to plug into the
        // `seek` event and calculate the equivalent in seconds (seek event
        // receives a position float 0-1) – See the README.md for explanation why we
        // need this
        this.wavesurfer.on("seek", (pos: any) => {
            if (this.state.isReady) {
                const formattedPos = this._posToSec(pos);
                this.setState({
                    formattedPos,
                });
                this.props.onPosChange({
                    originalArgs: [formattedPos],
                    wavesurfer: this.wavesurfer,
                });
            }
        });

        // hook up events to callback handlers passed in as props
        EVENTS.forEach((e) => {
            const propCallback = this.props[`on${capitaliseFirstLetter(e)}`];
            const wavesurfer = this.wavesurfer;
            if (propCallback) {
                this.wavesurfer.on(e, (...originalArgs: any) => {
                    propCallback({
                        originalArgs,
                        wavesurfer,
                    });
                });
            }
        });

        // if audioFile prop, load file
        if (this.props.audioFile) {
            this.loadAudio(this.props.audioFile, this.props.audioPeaks);
        }

        // if mediaElt prop, load media Element
        if (this.props.mediaElt) {
            this.loadMediaElt(this.props.mediaElt, this.props.audioPeaks);
        }

        if (this.props.responsive) {
            window.addEventListener("resize", this.handleResize, false);
        }
    }

    // update wavesurfer rendering manually
    public UNSAFE_componentWillReceiveProps(nextProps: any) {
        let newSource = false;
        let seekToInNewFile: any;

        // update audioFile
        if (this.props.audioFile !== nextProps.audioFile) {
            this.setState({
                isReady: false,
            });
            this.loadAudio(nextProps.audioFile, nextProps.audioPeaks);
            newSource = true;
        }

        // update mediaElt
        if (this.props.mediaElt !== nextProps.mediaElt) {
            this.setState({
                isReady: false,
            });
            this.loadMediaElt(nextProps.mediaElt, nextProps.audioPeaks);
            newSource = true;
        }

        // update peaks
        if (this.props.audioPeaks !== nextProps.audioPeaks) {
            if (nextProps.mediaElt) {
                this.loadMediaElt(nextProps.mediaElt, nextProps.audioPeaks);
            } else {
                this.loadAudio(nextProps.audioFile, nextProps.audioPeaks);
            }
        }

        // update position
        if (
            nextProps.pos !== undefined &&
            this.state.isReady &&
            nextProps.pos !== this.props.pos &&
            nextProps.pos !== this.state.pos
        ) {
            if (newSource) {
                seekToInNewFile = this.wavesurfer.on("ready", () => {
                    this.seekTo(nextProps.pos);
                    seekToInNewFile.un();
                });
            } else {
                this.seekTo(nextProps.pos);
            }
        }

        // update playing state
        if (
            !newSource &&
            (this.props.playing !== nextProps.playing ||
                this.wavesurfer.isPlaying() !== nextProps.playing)
        ) {
            if (nextProps.playing) {
                this.wavesurfer.play();
            } else {
                this.wavesurfer.pause();
            }
        }

        // update volume
        if (this.props.volume !== nextProps.volume) {
            this.wavesurfer.setVolume(nextProps.volume);
        }

        // update volume
        if (this.props.zoom !== nextProps.zoom) {
            this.wavesurfer.zoom(nextProps.zoom);
        }

        // update audioRate
        if (this.props.options.audioRate !== nextProps.options.audioRate) {
            this.wavesurfer.setPlaybackRate(nextProps.options.audioRate);
        }

        // turn responsive on
        if (
            nextProps.responsive &&
            this.props.responsive !== nextProps.responsive
        ) {
            window.addEventListener("resize", this.handleResize, false);
        }

        // turn responsive off
        if (
            !nextProps.responsive &&
            this.props.responsive !== nextProps.responsive
        ) {
            window.removeEventListener("resize", this.handleResize);
        }
    }

    public componentWillUnmount() {
        // remove listeners
        EVENTS.forEach((e) => {
            this.wavesurfer.un(e);
        });

        // destroy wavesurfer instance
        this.wavesurfer.destroy();

        if (this.props.responsive) {
            window.removeEventListener("resize", this.handleResize);
        }
    }

    // receives seconds and transforms this to the position as a float 0-1
    protected _secToPos(sec: number) {
        return 1 / this.wavesurfer.getDuration() * sec;
    }

    // receives position as a float 0-1 and transforms this to seconds
    protected _posToSec(pos: number) {
        return pos * this.wavesurfer.getDuration();
    }

    // pos is in seconds, the 0-1 proportional position we calculate here …
    protected seekTo(sec: number) {
        const pos = this._secToPos(sec);
        if (this.props.options.autoCenter) {
            this.wavesurfer.seekAndCenter(pos);
        } else {
            this.wavesurfer.seekTo(pos);
        }
    }

    // load a media element selector or HTML element
    // if selector, get the HTML element for it
    // and pass to loadAudio
    protected loadMediaElt(selectorOrElt: any, audioPeaks: any) {
        if (selectorOrElt instanceof (window as any).HTMLElement) {
            this.loadAudio(selectorOrElt, audioPeaks);
        } else {
            if (!window.document.querySelector(selectorOrElt)) {
                throw new Error("Media Element not found!");
            }

            this.loadAudio(window.document.querySelector(selectorOrElt), audioPeaks);
        }
    }

    // pass audio data to wavesurfer
    protected loadAudio(audioFileOrElt: any, audioPeaks: any) {
        if (audioFileOrElt instanceof (window as any).HTMLElement) {
            // media element
            this.wavesurfer.loadMediaElement(audioFileOrElt, audioPeaks);
        } else if (typeof audioFileOrElt === "string") {
            // bog-standard string is handled by load method and ajax call
            this.wavesurfer.load(audioFileOrElt, audioPeaks);
        } else if (
            audioFileOrElt instanceof window.Blob ||
            audioFileOrElt instanceof (window as any).File
        ) {
            // blob or file is loaded with loadBlob method
            this.wavesurfer.loadBlob(audioFileOrElt, audioPeaks);
        } else {
            throw new Error(`Wavesurfer.loadAudio expects prop audioFile
        to be either HTMLElement, string or file/blob`);
        }
    }

    private handleResize = () => { /* noop */ };
}

/* tslint:disable:object-literal-sort-keys */

Wavesurfer.propTypes = {
    playing: PropTypes.bool,
    pos: PropTypes.number,
    audioFile: (props: any, propName: string, componentName: string) => {
        const prop = props[propName];
        if (
            prop &&
            typeof prop !== "string" &&
            !(prop instanceof window.Blob) &&
            !(prop instanceof (window as any).File)
        ) {
            return new Error(`Invalid ${propName} supplied to ${componentName}
        expected either string or file/blob`);
        }

        return null;
    },
    mediaElt: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.instanceOf((window as any).HTMLElement),
    ]),
    audioPeaks: PropTypes.array,
    volume: PropTypes.number,
    zoom: PropTypes.number,
    responsive: PropTypes.bool,
    onPosChange: PropTypes.func,
    children: PropTypes.oneOfType([PropTypes.element, PropTypes.array]),
    options: PropTypes.shape({
        audioRate: PropTypes.number,
        backend: PropTypes.oneOf(["WebAudio", "MediaElement"]),
        barWidth: (props: any, propName: string, componentName: string) => {
            const prop = props[propName];
            if (prop !== undefined && typeof prop !== "number") {
                return new Error(`Invalid ${propName} supplied to ${componentName}
          expected either undefined or number`);
            }

            return null;
        },
        cursorColor: PropTypes.string,
        cursorWidth: positiveIntegerProptype,
        dragSelection: PropTypes.bool,
        fillParent: PropTypes.bool,
        height: positiveIntegerProptype,
        hideScrollbar: PropTypes.bool,
        interact: PropTypes.bool,
        loopSelection: PropTypes.bool,
        mediaControls: PropTypes.bool,
        minPxPerSec: positiveIntegerProptype,
        normalize: PropTypes.bool,
        pixelRatio: PropTypes.number,
        progressColor: PropTypes.string,
        scrollParent: PropTypes.bool,
        skipLength: PropTypes.number,
        waveColor: PropTypes.oneOfType([
            PropTypes.instanceOf((window as any).CanvasGradient),
            PropTypes.string,
        ]),
        autoCenter: PropTypes.bool,
    }),
};

/* tslint:enable:object-literal-sort-keys */

Wavesurfer.defaultProps = {
    onPosChange: () => { /* noop */ },
    options: WaveSurfer.defaultParams,
    playing: false,
    pos: 0,
    responsive: true,
};

export default Wavesurfer;
