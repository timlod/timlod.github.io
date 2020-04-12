'use strict';
/*
D3.js code for DataVis2020 Assignment 2.
Uses adapted snippets from https://kartoteket.as/features/corona/timeline-map/ (line chart),
https://www.axismaps.com/blog/2014/10/geography-of-jobs-animated-mapping-with-d3/ (slider and animation) and
https://vizhub.com/curran/8704c9b7c6df43cabf839aa3f1cb7b70?edit=files&file=bundle.js (data loading and legend)

Copyright Tim Loderhose (tim@loderhose.com), 2020
 */
const loadAndProcessData = () =>
    Promise
        .all([
            d3.json('https://timlod.github.io/data/50m.json'),
            d3.json('https://timlod.github.io/data/data.json'),
            d3.json('https://timlod.github.io/data/hashtags.json'),
            d3.json('https://timlod.github.io/data/timeline2.json')
        ])
        .then(([topoJSONdata, tweets, hashtags, timeline]) => {

            const twitter = Object();
            twitter.locations = tweets.columns
            twitter.ts = Array()
            tweets.index.slice(1).forEach(d => twitter.ts.push(new Date(d)))
            twitter.classes = tweets.data[0]
            twitter.data = tweets.data.slice(1)
            // Add hashtags to data object
            twitter.data.forEach((d, i) => d.forEach((g, j) => g.hashtags = hashtags.data[i][j]))
            const countries = topojson.feature(topoJSONdata, topoJSONdata.objects.countries);
            timeline.forEach(d => d.date = new Date(d.created_at))
            twitter.timeline = timeline
            twitter.series = [{values: timeline}]
            twitter.series[0].values.forEach(d => d.totalvalue = d.value[0] + d.value[1])
            return [countries.features, twitter];
        });

const sizeLegend = (selection, props) => {
    const {
        sizeScale,
        spacing,
        textOffset,
        numTicks,
        tickFormat
    } = props;

    const ticks = sizeScale.ticks(numTicks)
        .filter(d => d !== 0)
        .reverse();

    // ticks is somehow broken, give 6 ticks for 4-5-6, and only 2 for 3
    const groups = selection.selectAll('g').data(ticks);
    const groupsEnter = groups
        .enter().append('g')
        .attr('class', 'tick');
    groupsEnter
        .merge(groups)
        .attr('transform', (d, i) =>
            `translate(0, ${i * spacing})`
        );
    groups.exit().remove();

    // think about how to align text
    groupsEnter.append('circle')
        .merge(groups.select('circle'))
        .attr('r', sizeScale);

    groupsEnter.append('text')
        .merge(groups.select('text'))
        .text(tickFormat)
        .attr('dy', '0.32em')
        .attr('x', d => sizeScale(d) + textOffset);

};

var width = 960;
var height = 650;

var svg = d3.select("#map-container").append("svg")
    .attr("width", width)
    .attr("height", height);

const projection = d3.geoNaturalEarth1();
const pathGenerator = d3.geoPath().projection(projection);

// Some constants
var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    orderedColumns = [],
    currentFrame = 0,
    interval,
    frameLength = 1000,
    isPlaying = true;

var dateScale, sliderScale, slider;
// should be equal to x_offset of linechart
var sliderMargin = 100;
var probe,
    hoverData;
var tooltipPos
// Put this onto svg and not g to have the world boundary under the countries
// g now only includes countries (see also path selection below)
// This causes the zoom to not move the boundary - wrong!
// Instead put the boundary under g - top level, and add the countries in a sub-element g
const map = svg.append('g')
    .attr("class", "map");
map.append('path')
    .attr('class', 'sphere')
    .attr('d', pathGenerator({type: 'Sphere'}));

probe = d3.select("#map-container").append("div")
    .attr("id", "probe");
//const colorLegendG = svg.append('g').attr('transform', `translate(40,310)`);

svg.call(
    d3.zoom().on('zoom', () => {
        map.attr('transform', d3.event.transform);
    })
);

var sizeScale;
var twitter;
var circles;
loadAndProcessData().then(([features, tw]) => {

    twitter = tw
    orderedColumns = twitter.ts

    // Flatten values array, sort by rv
    sizeScale = d3.scaleSqrt()
        .domain([0, d3.quantile(twitter.data.flat().map(d => d3.max(d)).sort(d3.ascending), 0.9995)])
        .range([0, 15]);

    map.append('g')
        .selectAll('path')
        .data(features)
        .join('path')
        .attr('class', 'country')
        .attr('d', pathGenerator)
        .attr('fill', d => '#e8e8e8');

    twitter.locations.forEach(d => {
        d.projected = projection(d.slice(0, 2));
    });

    circles = map.selectAll('circle')
        .data(twitter.locations)
        .join("g")
        .attr("class", "location")
        .attr('transform', d => `translate(${d.projected})`)
        .on("mousemove", function (d, i) {
            hoverData = twitter.data[currentFrame][i];
            setProbeContent(d, twitter.data[currentFrame][i]);
            probe.style("display", "block");
            probe.style("top", (d3.event.pageY - 80) + "px");
            probe.style("left", (d3.event.pageX + 10) + "px");
        })
        .on("mouseout", function () {
            hoverData = null;
            probe.style("display", "none");
        })
        .selectAll("circle")
        .data((d, i) => twitter.data[twitter.ts.length - 1][i])
        .join("circle")
        // stance class for colouring through css
        .attr("class", (d, i) => "c" + i)
        // init with zero radius
        .attr("r", d => 0);


    map.append('g')
        .attr('transform', `translate(120,280)`)
        .call(sizeLegend, {
            sizeScale,
            spacing: 25,
            textOffset: 10,
            numTicks: 5,
            tickFormat: d3.format(',.2r')
        })
        .append('text')
        .attr('class', 'legend-title')
        .text('# tweets')
        .attr('y', -25)
        .attr('x', -10);

    dateScale = createDateScale(orderedColumns).range([0, width - 2 * sliderMargin]);
    createSlider();

    d3.select("#play")
        .attr("title", "Play animation")
        .on("click", function () {
            if (!isPlaying) {
                d3.select(this).classed("pause", true).attr("title", "Pause animation");
                animate();
            } else {
                d3.select(this).classed("pause", false).attr("title", "Play animation");
                clearInterval(interval);
            }
            isPlaying = !isPlaying;
        });
    if (isPlaying) {
        d3.select("#play").classed("pause", true).attr("title", "Pause animation");
    }
    draw(currentFrame); // initial map

    changeChart();
    animate()
});


function animate() {
    interval = setInterval(function () {
        currentFrame++;

        if (currentFrame == orderedColumns.length) currentFrame = 0;

        d3.select("#slider-div .d3-slider-handle")
            .style("left", 100 * currentFrame / orderedColumns.length + "%");
        slider.value(currentFrame);

        draw(currentFrame, true);

        if (currentFrame == orderedColumns.length - 1) {
            //isPlaying = false;
            //d3.select("#play").classed("pause", false).attr("title", "Play animation");
            //clearInterval(interval);
            currentFrame = 0;
        }

    }, frameLength);
}

function draw(m, tween) {
    if (typeof tooltipPos === "function") tooltipPos();
    circles
        .data((d, i) => twitter.data[m][i])
        .sort(function (a, b) {
            // catch nulls, and sort circles by size (smallest on top)
            return b - a;
        })
    var j = -1
    if (tween) {
        circles
            .transition()
            .ease(d3.easeLinear)
            .duration(frameLength)
            .attr("r", function (d, i) {
                if (i === 0) {
                    j++;
                    return sizeScale(d);
                } else {
                    // keep sqrt scale but be internally consistent
                    var other = twitter.data[m][j][0]
                    return other ? sizeScale(other) * d / other : 0;
                }
                //return sizeScale(radiusValue(twitter.data[m][j]) - d)

            });
    } else {
        circles.attr("r", function (d, i) {
            //possibly add rv
            if (i === 0) {
                j++;
                return sizeScale(d);
            } else {
                var other = twitter.data[m][j][0]
                return other ? sizeScale(other) * d / other : 0;
            }
            //return sizeScale(radiusValue(twitter.data[m][j]) - d)
        });
    }
}

var format = d3.format(" ,");


function setProbeContent(loc, d) {
    var date = orderedColumns[currentFrame].toDateString(),
        hs = d.hashtags,
        country = loc[3],
        place = loc[2];
    // Change into location name along with numbers and hashtags
    var html = "<strong>" + place + ", " + country + "</strong><br/>" +
        format(d[0]) + " favor " + format(d[1]) + " against" + "<br/>" +
        "<span>Top hashtags: " + Object.keys(hs).slice(0, 5).join(", ") + "</span>"
        + "<span>" + date + "</span>";
    probe.html(html);
}

function createDateScale(columns) {
    return d3.scaleTime()
        .domain([columns[0], columns[columns.length - 1]])
}

function sliderProbe() {
    var d = dateScale.invert((d3.mouse(this)[0]));
    d3.select("#slider-probe")
        .style("left", d3.mouse(this)[0] + sliderMargin + "px")
        .style("display", "block")
        .select("p")
        .html((d.getDate() + 1) + " " + months[d.getMonth()])
}

function createSlider() {

    // Slider from first index until number of timesteps (orderedColumns contains mon-year data)
    sliderScale = d3.scaleLinear().domain([0, orderedColumns.length - 1]);

    var val = slider ? slider.value() : 0;

    slider = d3.slider()
        .scale(sliderScale)
        .on("slide", function (event, value) {
            if (isPlaying) {
                clearInterval(interval);
            }
            currentFrame = value;
            draw(value, d3.event.type != "drag");
        })
        .on("slideend", function () {
            if (isPlaying) animate();
            d3.select("#slider-div").on("mousemove", sliderProbe)
        })
        .on("slidestart", function () {
            d3.select("#slider-div").on("mousemove", null)
        })
        .value(val);

    d3.select("#slider-div").remove();

    d3.select("#slider-container")
        .append("div")
        .attr("id", "slider-div")
        // should be equal to width - x_offset (margin?) from chart
        .style("width", "760px")//dateScale.range()[1] + "px")
        .on("mousemove", sliderProbe)
        .on("mouseout", function () {
            d3.select("#slider-probe").style("display", "none");
        })
        .call(slider);

    d3.select("#slider-div a").on("mousemove", function () {
        d3.event.stopPropagation();
    });

    var sliderAxis = d3.axisBottom()
        .scale(dateScale)
        .tickValues(dateScale.ticks(orderedColumns.length).filter(function (d, i) {
            // ticks only for beginning of each year, plus first and last
            return i == 0 || (i % 2) == 0 | i == orderedColumns.length - 1;
        }))
        .tickFormat(function (d) {
            // abbreviated year for most, full month/year for the ends
            if (d.getDate() == 0) return "'sdfg" + d.getMonth().toString().substr(2);
            return d.getDate() + " " + months[d.getMonth()];
        })
        .tickSize(10)

    d3.select("#axis").remove();

    d3.select("#slider-container")
        .append("svg")
        .attr("id", "axis")
        .attr("width", dateScale.range()[1] + sliderMargin * 3)
        .attr("height", 25)
        .append("g")
        .attr("transform", "translate(" + (sliderMargin + 1) + ",0)")
        .call(sliderAxis);

    d3.select("#axis > g g:first-child text").attr("text-anchor", "end").style("text-anchor", "end");
    d3.select("#axis > g g:last-of-type text").attr("text-anchor", "start").style("text-anchor", "start");
}

var changeChart = function () {

    var chartWidth = width;
    var x_offset = sliderMargin
    var y_offset = 70
    var y_axisheight = 250
    //var margin = ({top: 20, right: 130, bottom: 50, left: 120});
    var margin = ({top: 0, right: 0, bottom: 0, left: 0});
    var y = function () {
        return d3
            .scaleBand()
            .domain(twitter.ts.map(d => d.toDateString()) /*.sort(d3.descending)*/)
            .range([height - 200, margin.top])
            .paddingInner(1)
            .paddingOuter(1)
            .align(0.1)
            .round(true);
    }();
    // defines width of chart x axis
    var chartX = chartWidth < 750 ? (chartWidth < 400 ? 0 : 50) : x_offset;//chartWidth / 11;
    var x = function () {
        return d3
            .scaleTime()
            .domain(d3.extent(twitter.ts))
            // offset for the chart to sit nicely with y axis
            .range([chartX, chartWidth - x_offset]);
    }();
    var xAxis = svg => {
        const r = x.range();
        const w = r[1] - r[0];
        // moves x axis around (vertically
        svg.attr('transform', `translate(0,${height - y_offset})`).call(
            d3
                .axisBottom(x)
                .tickFormat(d3.timeFormat("")));

    };
    var yAxis = (svg, y) =>
        // moves y axis further around
        svg.attr('transform', `translate(${chartWidth - x_offset},0)`).call(
            d3
                .axisRight(y)
                .tickSizeOuter(0)
                .tickSizeInner((5) * -1)
        );
    //SCALES
    var size = s => {
        return !s ? s : sizeLinear(s);
    };
    var sizeLinear = d3
        .scaleSqrt()
        .domain(d3.extent(twitter.timeline, d => d.totalvalue))//[0] + d.value[1]))
        .range([1, chartWidth / 10]);
    var opacity = d3
        .scaleLinear()
        .domain([d3.max(twitter.timeline, d => d.totalvalue), 1])//[0] + d.value[1]), 1])
        .range([.10, .65]);
    var yScale = function () {
        return d3
            .scaleLinear()
            .domain([
                //d3.min(twitter.timeline, s => d3.min(s.values, v => v.value)),
                0, d3.max(twitter.timeline, s => s.totalvalue)//d3.max([s.value[0], s.value[1]]))
            ])
            // Defines y range (height on chart)
            .range([height - y_offset, height - y_axisheight]);
    }();

    const chart = d3.select("chart-container").remove();
    const t = chart.transition().duration(frameLength);
// initalize on first call
    if (!chart.g) {
        // change comments to fix chart
        // chart.g = d3
        //     .selectAll('.map')
        chart.g = svg.append("g")
            .attr('class', 'chart');

        chart.lines = chart.g.append('g').classed('lines', true);
        chart.xAxis = chart.g
            .append("g")
            .classed("axis axis-x", true)
            .attr('font-size', '5px');
        chart.yAxis = chart.g.append("g").classed("axis axis-y", true);
        chart.legend = chart.g
            .append("g")
            .classed("legend", true)
            // Moves legend up and down, kinda messed up value-wise now
            .attr('transform', `translate(${chartX}, ${height - 55})`);
        chart.tooltip = chart.g.append('g').classed('tooltip', true);

        // add X axis
        chart.xAxis.call(xAxis);
    }
    // adds yaxis
    chart.yAxis.call(yAxis, yScale);

    // the guide that should scroll with time
    const tooltip = chart.tooltip.append('g').attr('class', 'guide');
    var tooltip_height = y_axisheight

    tooltip
        .append('line')
        .attr('stroke', '#ddd')
        .style('stroke-opacity', 0.25)
        .attr('stroke-width', 10)
        .attr('x1', chartX + 3)
        .attr('x2', chartX + 3)
        .attr('y1', height - tooltip_height)
        .attr('y2', height - y_offset);

    var totalLine = d3
        .line()
        .defined(d => !isNaN(d.value[0]))
        .x(d => x(d.date))
        .y(d => yScale(d.value[0]))
    //.curve(d3.curveBasis);

    var lowLine = d3
        .line()
        .defined(d => !isNaN(d.value[1]))
        .x(d => x(d.date))
        .y(d => yScale(d.value[1]))
    //.curve(d3.curveBasis);

    chart.lines.selectAll('path').remove();
    var totalColor = "#3d9bd2"
    chart.lines
        .append("g")
        .attr("fill", "#ffffff")
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .selectAll("path")
        .data(twitter.series)
        .join("path")
        .attr("stroke", totalColor)
        .attr("d", d => totalLine(d.values));

    var lowColor = "#bb301f"
    chart.lines
        .append("g")
        .attr("fill", "#fff")
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .selectAll("path")
        .data(twitter.series)
        .join("path")
        .attr("stroke", lowColor)
        .attr("d", d => lowLine(d.values));

// legend
    chart.legend
        .append('line')
        .attr('stroke', totalColor)
        .style('stroke-opacity', 1)
        .attr('stroke-width', 2)
        .attr('x1', 0)
        .attr('x2', 100)
        .attr('class', 'legend-line')
        .attr('y1', 50)
        .attr('y2', 50);

    chart.legend
        .append('g')
        .attr('transform', 'translate(110,52)')
        .append('text')
        .attr('font-size', `10px`)
        .attr('fill', '#333')
        .text('# tweets (favor)');

    chart.legend
        .append('line')
        .attr('stroke', lowColor)
        .style('stroke-opacity', 1)
        .attr('stroke-width', 2)
        .attr('x1', 200)
        .attr('x2', 300)
        .attr('class', 'legend-line')
        .attr('y1', 50)
        .attr('y2', 50);

    chart.legend
        .append('g')
        .attr('transform', 'translate(310,52)')
        .append('text')
        .attr('font-size', `10px`)
        .attr('fill', '#333')
        .text('# tweets (against)');

    const guide = d3.select('.guide');

    // called in draw, moves the tooltip along
    tooltipPos = function () {
        const r = x.range();
        const w = r[1] - r[0];
        const numDates = twitter.ts.length;
        const tickLength = w / numDates;
        guide.attr('transform', `translate(${(r[0] + tickLength * currentFrame) - chartX},0)`);
    }
};
