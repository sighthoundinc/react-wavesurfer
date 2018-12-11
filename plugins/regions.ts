/* tslint:disable:file-header */

import * as PropTypes from "prop-types";
import { Component } from "react";

const REGIONS_EVENTS = [
    "region-in",
    "region-out",
    "region-mouseenter",
    "region-mouseleave",
    "region-click",
    "region-dblclick",
    "region-updated",
    "region-update-end",
    "region-removed",
    "region-play",
];

const REGION_EVENTS = [
    "in",
    "out",
    "remove",
    "update",
    "click",
    "dbclick",
    "over",
    "leave",
];

/**
 * @description Capitalise the first letter of a string
 */
function capitaliseFirstLetter(str: string) {
    return str
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

class Regions extends Component<any, any> {

    public static propTypes: any;
    public static defaultProps: any;

    constructor(props: any) {
        super(props);

        // this is so that jscs does not force us to go functional
        this.state = {};
    }

    public componentDidMount() {
        if (this.props.isReady) {
            this.init.call(this);
        }

        this.props.wavesurfer.on("ready", this.init.bind(this));
    }

    public componentWillReceiveProps(nextProps: any) {
        // only update if the wavesurfer instance is ready and plugin too
        if (!this.props.isReady ||
            !this.props.wavesurfer.regions) {
            return;
        }

        // cache reference to old regions
        const oldRegions = Object.create(this.props.wavesurfer.regions.list);
        let newRegionId;
        let oldRegionId;

        for (newRegionId in nextProps.regions) {
            if ({}.hasOwnProperty.call(nextProps.regions, newRegionId)) {
                const newRegion = nextProps.regions[newRegionId];

                // remove from oldRegions
                delete oldRegions[newRegionId];

                // new regions
                if (!this.props.wavesurfer.regions.list[newRegionId]) {
                    this.hookUpRegionEvents(nextProps.wavesurfer.addRegion(newRegion));

                    // update regions
                } else if (
                    oldRegions[newRegionId] &&
                    (oldRegions[newRegionId].start !== newRegion.start ||
                        oldRegions[newRegionId].end !== newRegion.end)
                ) {
                    nextProps.wavesurfer.regions.list[newRegionId].update({
                        end: newRegion.end,
                        start: newRegion.start,
                    });
                }
            }
        }

        // remove any old regions
        for (oldRegionId in oldRegions) {
            if ({}.hasOwnProperty.call(oldRegions, oldRegionId)) {
                nextProps.wavesurfer.regions.list[oldRegionId].remove();
            }
        }
    }

    public shouldComponentUpdate() {
        return false;
    }

    public componentWillUnmount() {
        REGION_EVENTS.forEach((e) => {
            this.props.wavesurfer.un(e);
        });
    }

    public render() {
        return false;
    }

    private init() {
        const { wavesurfer, regions } = this.props;
        let newRegionId;

        REGIONS_EVENTS.forEach((e) => {
            const propCallback = this.props[`on${capitaliseFirstLetter(e)}`];
            if (!propCallback) {
                return;
            }

            wavesurfer.on(e, (...originalArgs: any) => {
                propCallback({
                    originalArgs,
                    wavesurfer,
                });
            });
        });

        // add regions and hook up callbacks to region objects
        for (newRegionId in regions) {
            if ({}.hasOwnProperty.call(regions, newRegionId)) {
                this.hookUpRegionEvents(wavesurfer.addRegion(regions[newRegionId]));
            }
        }
    }

    private hookUpRegionEvents(region: any) {
        REGION_EVENTS.forEach((e) => {
            const propCallback = this.props[
                `onSingleRegion${capitaliseFirstLetter(e)}`
            ];
            const { wavesurfer } = this.props;
            if (propCallback) {
                region.on(e, (...originalArgs: any) => {
                    propCallback({
                        originalArgs,
                        region,
                        wavesurfer,
                    });
                });
            }
        });

        region.on("remove", () => {
            REGION_EVENTS.forEach((e) => {
                region.un(e);
            });
        });
    }
}

Regions.propTypes = {
    isReady: PropTypes.bool,
    regions: PropTypes.object,
    wavesurfer: PropTypes.object,
};

Regions.defaultProps = {
    regions: [],
};

export default Regions;
