"use strict";
var express = require("express");
var router = express.Router();
var statistics = require("simple-statistics");
var ErrorSerializer = require("../serializers/error");
var flows;
var objects;
var datatypes;
var units;

function getFieldsFromDatatype(datatype, asValue, includeTime = true) {
	let fields;
	if (includeTime) {
		fields += "time, ";
	}
	if (datatype === "boolean") {
		fields = "valueBoolean";
	} else if (datatype === "date") {
		fields = "valueDate";
	} else if (datatype === "integer") {
		fields = "valueInteger";
	} else if (datatype === "json") {
		fields = "valueJson";
	} else if (datatype === "string") {
		fields = "valueString";
	} else if (datatype === "time") {
		fields = "valueTime";
	} else if (datatype === "float") {
		fields = "valueFloat";
	} else if (datatype === "geo") {
		fields = "valueString";
	} else {
		fields = "value";
	}
	if (asValue) {
		fields += " as value";
	}
	return fields;
}
function gaussian_pdf(x, mean, sigma) {
	var gaussianConstant = 1 / Math.sqrt(2 * Math.PI), x = (x - mean) / sigma;
	return gaussianConstant * Math.exp(-.5 * x * x) / sigma;
};

/**
 * @api {get} /exploration/summary Explore summary
 * @apiName Explore summary 
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID to explore
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/summary/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var flow_id = req.query.flow_id;

	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405, "message": "Method Not Allowed" }).serialize());
	} else {
		var flowsDT = db.getCollection("flows");
		datatypes = db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({ id: flow_id, }).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatypeName = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.name : null;
		var datatypeType = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.type : null;
		var datatypeClassification = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.classification : null;
		let dt = getFieldsFromDatatype(datatypeName, false, false);
		let where = "";
		if (typeof req.query.start !== "undefined") {
			if (!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if (req.query.start.toString().length === 10) { start = req.query.start * 1e9; }
				else if (req.query.start.toString().length === 13) { start = req.query.start * 1e6; }
				else if (req.query.start.toString().length === 16) { start = req.query.start * 1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}
		if (typeof req.query.end !== "undefined") {
			if (!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if (req.query.end.toString().length === 10) { end = req.query.end * 1e9; }
				else if (req.query.end.toString().length === 13) { end = req.query.end * 1e6; }
				else if (req.query.end.toString().length === 16) { end = req.query.end * 1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}
		if (where === "") {
			where = "AND time > now()-52w";// TODO : performance issue ; make the max to 1Y
		}
		let query = `SELECT FIRST(${dt}) as first, LAST(${dt}) as last, COUNT(${dt}) as count, MEAN(${dt}) as mean, stddev(${dt}) as std_dev, MIN(${dt}) as minimum, MAX(${dt}) as maximum, MODE(${dt}) as mode, MEDIAN(${dt}) as median, PERCENTILE(${dt},25) as "quantile1", PERCENTILE(${dt},50) as "quantile2", PERCENTILE(${dt},75) as "quantile3" FROM data WHERE flow_id='${flow_id}' ${where}`;
		t6console.log(sprintf("Query: %s", query));
		let start = typeof req.query.start !== "undefined" ? req.query.start : "";
		let end = typeof req.query.end !== "undefined" ? req.query.end : "";
		dbInfluxDB.query(query).then(data => {
			if (data.length > 0) {
				data.map(function(d) {
					d.links = {
						"summary": sprintf("%s/v%s/exploration/summary?flow_id=%s&start=%s&end=%s", baseUrl_https, version, flow_id, start, end),
						"normality": sprintf("%s/v%s/exploration/normality?flow_id=%s&start=%s&end=%s", baseUrl_https, version, flow_id, start, end),
						"head": sprintf("%s/v%s/exploration/head?flow_id=%s&start=%s&end=%s", baseUrl_https, version, flow_id, start, end),
						"tail": sprintf("%s/v%s/exploration/tail?flow_id=%s&start=%s&end=%s", baseUrl_https, version, flow_id, start, end),
						"distribution": {
							"kernelDensityEstimation": sprintf("%s/v%s/exploration/kernelDensityEstimation?flow_id=%s&start=%s&end=%s", baseUrl_https, version, flow_id, start, end),
						},
					};
					d.time = undefined;
					d.start_date = moment(start).format("DD-MM-YYYY HH:mm:ss");
					d.end_date = moment(end).format("DD-MM-YYYY HH:mm:ss");
					d.data_type = {
						"name": datatypeName,
						"type": datatypeType,
						"classification": datatypeClassification,
					};
				});
				res.status(200).send(data[0]);
			} else {
				res.status(404).send({ err: "No data found", "id": 898.5, "code": 404, "message": "Not found" });
			}
		}).catch(err => {
			res.status(500).send({ err: err, "id": 898, "code": 500, "message": "Internal Error" });
		});
	}
});

/**
 * @api {get} /exploration/normality Explore for normality
 * @apiName Explore for normality
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID to explore
 * @apiParam {Float} [x] raw score x
 * @apiParam {Float} expectedValue Expected value of the population mean
 * @apiSuccess {Float} skewness Skewness
 * @apiSuccess {Float} z_score zScore
 * @apiSuccess {String} t_test tTest of the x value
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/normality/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var flow_id = req.query.flow_id;

	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405.2, "message": "Method Not Allowed" }).serialize());
	} else {
		var flowsDT = db.getCollection("flows");
		datatypes = db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({ id: flow_id, }).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatype = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.name : null;
		let dt = getFieldsFromDatatype(datatype, false, false);
		let where = "";
		if (typeof req.query.start !== "undefined") {
			if (!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if (req.query.start.toString().length === 10) { start = req.query.start * 1e9; }
				else if (req.query.start.toString().length === 13) { start = req.query.start * 1e6; }
				else if (req.query.start.toString().length === 16) { start = req.query.start * 1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}
		if (typeof req.query.end !== "undefined") {
			if (!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if (req.query.end.toString().length === 10) { end = req.query.end * 1e9; }
				else if (req.query.end.toString().length === 13) { end = req.query.end * 1e6; }
				else if (req.query.end.toString().length === 16) { end = req.query.end * 1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}
		if (where === "") {
			where = "AND time > now()-52w";// TODO : performance issue ; make the max to 1Y
		}
		let query = `SELECT ${dt} as value FROM data WHERE flow_id='${flow_id}' ${where}`;
		t6console.log(sprintf("Query: %s", query));
		dbInfluxDB.query(query).then(data => {
			if (data.length > 0) {
				let normalityData;
				let arrayOfValues = data.map(function(row) { return row.value; });
				normalityData = {
					"skewness": statistics.sampleSkewness(arrayOfValues),
					"z_score": typeof req.query.x !== "undefined" ? (statistics.zScore(req.query.x, statistics.mean(arrayOfValues), statistics.standardDeviation(arrayOfValues))) : undefined,
					"t_test": ((typeof req.query.x) !== "undefined" && (typeof req.query.expectedValue) !== "undefined") ? (statistics.tTest(arrayOfValues, req.query.expectedValue).toFixed(2)) : undefined,
					"endpoint_status": "Be cautious, this endpoint is beta !",
				}
				res.status(200).send(normalityData);
			} else {
				res.status(404).send({ err: "No data found", "id": 8985.5, "code": 404, "message": "Not found" });
			}
		}).catch(err => {
			res.status(500).send({ err: err, "id": 8985.0, "code": 500, "message": "Internal Error" });
		});
	}
});

/**
 * @api {get} /exploration/head|tail Explore the first|last n rows
 * @apiName Explore the first|last n rows
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID to explore
 * @apiParam {Integer} n Number of rows
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/:sorting(head|tail)/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var sorting = req.params.sorting === "head" ? "ASC" : (req.params.sorting === "tail" ? "DESC" : "ASC");
	var flow_id = req.query.flow_id;
	var limit = parseInt(req.query.n, 10) < 50 ? parseInt(req.query.n, 10) : 10;

	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405, "message": "Method Not Allowed" }).serialize());
	} else {
		let query = sprintf("SELECT * FROM data WHERE flow_id='%s' ORDER BY time %s LIMIT %s OFFSET %s", flow_id, sorting, limit, 0);
		t6console.log(sprintf("Query: %s", query));
		dbInfluxDB.query(query).then(data => {
			if (data.length > 0) {
				t6console.log(data[0]);
				data.map(function(d) {
					d.id = sprintf("%s/%s", flow_id, moment(d.time).format("x") * 1000);
					d.timestamp = Date.parse(d.time);
					d.time = d.time.toNanoISOString();
				});
				t6console.log(data[0]);
				res.status(200).send(data);
			} else {
				res.status(404).send({ err: "No data found", "id": 898.5, "code": 404, "message": "Not found" });
			}
		}).catch(err => {
			res.status(500).send({ err: err, "id": 898, "code": 500, "message": "Internal Error" });
		});
	}
});

/**
 * @api {get} /exploration/kernelDensityEstimation Display kernelDensityEstimation distribution
 * @apiName Display kernelDensityEstimation distribution
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to get data from
 * @apiParam {Integer} [start] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Integer} [end] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Number{1-5000}} [limit] Set the number of expected resources.
 * @apiParam {String="min","max","first","last","sum","count"} [select] Modifier function to modify the results
 * @apiParam {String="10ns, 100µ, 3600ms, 3600s, 1m, 3h, 4d, 2w, 365d"} [group] Group By Clause
 * @apiParam {String} [xAxis] Label value in X axis
 * @apiParam {String} [yAxis] Label value in Y axis
 * @apiParam {Integer} [width] output width of SVG chart
 * @apiParam {Integer} [height] output height of SVG chart
 * @apiParam {Integer} [ticks=10] Ticks
 * @apiSuccess {Svg} Svg image file
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/kernelDensityEstimation/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var statistics = require("simple-statistics");
	var d3nBar = require("d3node-barchart"); // TODO : it should be an histogram !
	var flow_id = req.query.flow_id;
	var group = req.query.group;
	var xAxis = typeof req.query.xAxis ? req.query.xAxis : "";
	var yAxis = typeof req.query.yAxis ? req.query.yAxis : "";
	var width = parseInt(req.query.width, 10);
	var height = parseInt(req.query.height, 10);
	var ticks = typeof req.query.ticks !== "undefined" ? req.query.ticks : 10;
	var query;
	var start;
	var end;

	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405, "message": "Method Not Allowed" }).serialize());
	} else {
		flows = db.getCollection("flows");
		units = db.getCollection("units");

		let where = "";

		if (typeof req.query.start !== "undefined") {
			if (!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if (req.query.start.toString().length === 10) { start = req.query.start * 1e9; }
				else if (req.query.start.toString().length === 13) { start = req.query.start * 1e6; }
				else if (req.query.start.toString().length === 16) { start = req.query.start * 1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}
		if (typeof req.query.end !== "undefined") {
			if (!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if (req.query.end.toString().length === 10) { end = req.query.end * 1e9; }
				else if (req.query.end.toString().length === 13) { end = req.query.end * 1e6; }
				else if (req.query.end.toString().length === 16) { end = req.query.end * 1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}

		var flow = flows.chain().find({ "id": { "$aeq": flow_id } }).limit(1);
		var join = flow.eqJoin(units.chain(), "unit", "id");

		var flowsDT = db.getCollection("flows");
		datatypes = db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({ id: flow_id, }).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatypeName = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.name : null;
		let dt = getFieldsFromDatatype(datatypeName, false, false);

		let group_by = "";
		if (typeof group !== "undefined") {
			group_by = sprintf("GROUP BY time(%s)", group);
		}

		query = `SELECT MEAN(${dt}) as mean FROM data WHERE flow_id='${flow_id}' ${where} ${group_by}`;
		t6console.log(sprintf("Query: %s", query));

		dbInfluxDB.query(query).then(data => {
			if (data.length > 0) {
				var graphData = [];
				let svg;

				// TODO : it should be an histogram !
				data.map(function(row) {
					if (typeof row.time !== "undefined") {
						graphData.push(row.mean);
					}
				});
				let dataDensity = new Array();
				let densityFunc = statistics.kernelDensityEstimation(graphData);
				let step = Math.round(statistics.max(graphData) - statistics.min(graphData), 0) / ticks;
				for (let n = statistics.min(graphData); n < statistics.max(graphData); n += step) {
					dataDensity.push({ key: Math.round(n * 100 / 100), value: densityFunc(n) });
				}
				svg = d3nBar({
					data: dataDensity,
					selector: "",
					container: "",
					labels: { xAxis: xAxis, yAxis: yAxis },
					width: width,
					height: height,
				});

				res.setHeader("content-type", "image/svg+xml");
				res.status(200).send(svg.svgString());
			} else {
				res.status(404).send({ err: "No data found", "id": 898.5, "code": 404, "message": "Not found" });
			}
		}).catch(err => {
			res.status(500).send({ err: err, "id": 898, "code": 500, "message": "Internal Error" });
		});
	}
});

/**
 * @api {get} /exploration/loess Display LOESS : LOcally Estimated Scatterplot Smoothing
 * @apiName Display LOESS : LOcally Estimated Scatterplot Smoothing
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to get data from
 * @apiParam {Integer} [start] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Integer} [end] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Number{1-5000}} [limit] Set the number of expected resources.
 * @apiParam {String="min","max","first","last","sum","count"} [select] Modifier function to modify the results
 * @apiParam {String="10ns, 100µ, 3600ms, 3600s, 1m, 3h, 4d, 2w, 365d"} [group] Group By Clause
 * @apiParam {String} [xAxis] Label value in X axis
 * @apiParam {String} [yAxis] Label value in Y axis
 * @apiParam {Integer} [width] output width of SVG chart
 * @apiParam {Integer} [height] output height of SVG chart
 * @apiSuccess {Svg} Svg image file
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/loess/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var flow_id = req.query.flow_id;
	var group = req.query.group;
	var xAxis = typeof req.query.xAxis ? req.query.xAxis : "";
	var yAxis = typeof req.query.yAxis ? req.query.yAxis : "";
	var width = parseInt(req.query.width, 10);
	var height = parseInt(req.query.height, 10);
	var query;
	var start;
	var end;

	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405, "message": "Method Not Allowed" }).serialize());
	} else {
		flows = db.getCollection("flows");
		units = db.getCollection("units");

		let where = "";

		if (typeof req.query.start !== "undefined") {
			if (!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if (req.query.start.toString().length === 10) { start = req.query.start * 1e9; }
				else if (req.query.start.toString().length === 13) { start = req.query.start * 1e6; }
				else if (req.query.start.toString().length === 16) { start = req.query.start * 1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}
		if (typeof req.query.end !== "undefined") {
			if (!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if (req.query.end.toString().length === 10) { end = req.query.end * 1e9; }
				else if (req.query.end.toString().length === 13) { end = req.query.end * 1e6; }
				else if (req.query.end.toString().length === 16) { end = req.query.end * 1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}

		var flow = flows.chain().find({ "id": { "$aeq": flow_id } }).limit(1);
		var join = flow.eqJoin(units.chain(), "unit", "id");

		var flowsDT = db.getCollection("flows");
		datatypes = db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({ id: flow_id, }).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatypeName = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.name : null;
		let dt = getFieldsFromDatatype(datatypeName, false, false);

		let group_by = "";
		if (typeof group !== "undefined") {
			group_by = sprintf("GROUP BY time(%s)", group);
		}

		query = `SELECT MEAN(${dt}) as mean FROM data WHERE flow_id='${flow_id}' ${where} ${group_by}`;
		t6console.log(sprintf("Query: %s", query));

		dbInfluxDB.query(query).then(meanData => {
			if (meanData.length > 0) {
				let graphScatterData = [];
				let graphLoessData = { x: [], y: [] };
				let graphLoess = [];
				let svg;
				meanData.map(function(row) {
					if (typeof row.time !== "undefined" && row.mean !== null) {
						graphScatterData.push({ key: parseInt(moment(row.time).format("x"), 10), value: row.mean });
						graphLoessData.x.push(parseInt(moment(row.time).format("x"), 10));
						graphLoessData.y.push(row.mean);
					}
				});

				var D3Node = require('d3-node');
				var Loess = require("loess");
				const d3n = new D3Node({
					selector: "",
					svgStyles: "",
					styles: "",
					container: "",
				});
				const d3 = d3n.d3;
				let _margin = { top: 20, right: 10, bottom: 60, left: 50 };
				let _lineWidth = 1.5;
				let _tickSize = 5;
				let _tickPadding = 5;
				let _lineColor = 'steelblue';
				let _lineColors = ['steelblue'];
				let _isCurve = true;

				svg = d3n.createSVG(width, height)
					.append('g')
					.attr('transform', `translate(${_margin.left}, ${_margin.top})`);
				width = width - _margin.left - _margin.right;
				height = height - _margin.top - _margin.bottom;

				let g = svg.append('g');
				let { allKeys } = graphScatterData;
				let xScale = d3.scaleTime()
					.domain(allKeys ? d3.extent(allKeys) : d3.extent(graphScatterData, d => d.key))
					.rangeRound([0, width]);
				let yScale = d3.scaleLinear()
					.domain(allKeys ? [d3.min(graphScatterData, d => d3.min(d, v => v.value)), d3.max(graphScatterData, d => d3.max(d, v => v.value))] : d3.extent(graphScatterData, d => d.value))
					.rangeRound([height, 0]);
				let xAxis = d3.axisBottom(xScale)
					.tickSize(_tickSize)
					.tickPadding(_tickPadding);
				let yAxis = d3.axisLeft(yScale)
					.tickSize(_tickSize)
					.tickPadding(_tickPadding);

				g.append('g')
					.attr('transform', `translate(0, ${height})`)
					.call(xAxis);

				g.append('g').call(yAxis);

				g.append('g')
					.selectAll("dot")
					.data(allKeys ? data : graphScatterData)
					.enter().append("circle")
					.attr("cx", function(d) { return xScale(d.key); })
					.attr("cy", function(d) { return yScale(d.value); })
					.attr("r", _lineWidth)
					.attr("class", "dot")
					.attr("fill", (d, i) => _lineColors.length ? _lineColors[i] : _lineColor);

				/* LOESS */
				let options = { span: 0.5, band: 0.8, degree: 1 };
				let model = new Loess.default(graphLoessData, options);
				let newData = model.grid([graphLoessData.x.length]);
				let fit = model.predict(newData);

				let n = 0;
				(fit.halfwidth).map(function(row) {
					graphLoess.push({ key: n, value: row });
					n++;
				});
				//{ allKeys } = graphLoess;
				xScale = d3.scaleTime()
					.domain(allKeys ? d3.extent(allKeys) : d3.extent(graphLoess, d => d.key))
					.rangeRound([0, width]);
				yScale = d3.scaleLinear()
					.domain(allKeys ? [d3.min(graphLoess, d => d3.min(d, v => v.value)), d3.max(graphLoess, d => d3.max(d, v => v.value))] : d3.extent(graphLoess, d => d.value))
					.rangeRound([height, 0]);
				xAxis = d3.axisBottom(xScale)
					.tickSize(_tickSize)
					.tickPadding(_tickPadding);
				yAxis = d3.axisLeft(yScale)
					.tickSize(_tickSize)
					.tickPadding(_tickPadding);

				let lineChart = d3.line()
					.x(d => xScale(d.key))
					.y(d => yScale(d.value));

				if (_isCurve) lineChart.curve(d3.curveBasis);
				g.append('g')
					.attr('fill', 'none')
					.attr('stroke-width', _lineWidth)
					.selectAll('path')
					.data(allKeys ? data : [graphLoess])
					.enter().append("path")
					.attr('stroke', (d, i) => i < _lineColors.length ? _lineColors[i] : _lineColor)
					.attr('d', lineChart);

				// END LOESS
				res.setHeader("content-type", "image/svg+xml");
				res.status(200).send(d3n.svgString());
			} else {
				res.status(404).send({ err: "No data found", "id": 898.5, "code": 404, "message": "Not found" });
			}
		//}).catch(err => {
		//	res.status(500).send({ err: err, "id": 898, "code": 500, "message": "Internal Error" });
		});
	}
});

/**
 * @api {get} /exploration/frequencyDistribution Display frequency distribution
 * @apiName Display frequency distribution
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to get data from
 * @apiParam {Integer} [start] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Integer} [end] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Number{1-5000}} [limit] Set the number of expected resources.
 * @apiParam {String="min","max","first","last","sum","count"} [select] Modifier function to modify the results
 * @apiParam {String="10ns, 100µ, 3600ms, 3600s, 1m, 3h, 4d, 2w, 365d"} [group] Group By Clause
 * @apiParam {String} [xAxis] Label value in X axis
 * @apiParam {String} [yAxis] Label value in Y axis
 * @apiParam {Integer} [width] output width of SVG chart
 * @apiParam {Integer} [height] output height of SVG chart
 * @apiSuccess {Svg} Svg image file
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/frequencyDistribution/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var statistics = require("simple-statistics");
	var d3nBar = require("d3node-barchart"); // TODO : it should be an histogram !
	var flow_id = req.query.flow_id;
	var group = req.query.group;
	var xAxis = typeof req.query.xAxis ? req.query.xAxis : "";
	var yAxis = typeof req.query.yAxis ? req.query.yAxis : "";
	var width = parseInt(req.query.width, 10);
	var height = parseInt(req.query.height, 10);
	var query;
	var start;
	var end;

	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405, "message": "Method Not Allowed" }).serialize());
	} else {
		flows = db.getCollection("flows");
		units = db.getCollection("units");

		let where = "";

		if (typeof req.query.start !== "undefined") {
			if (!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if (req.query.start.toString().length === 10) { start = req.query.start * 1e9; }
				else if (req.query.start.toString().length === 13) { start = req.query.start * 1e6; }
				else if (req.query.start.toString().length === 16) { start = req.query.start * 1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}
		if (typeof req.query.end !== "undefined") {
			if (!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if (req.query.end.toString().length === 10) { end = req.query.end * 1e9; }
				else if (req.query.end.toString().length === 13) { end = req.query.end * 1e6; }
				else if (req.query.end.toString().length === 16) { end = req.query.end * 1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}

		var flow = flows.chain().find({ "id": { "$aeq": flow_id } }).limit(1);
		var join = flow.eqJoin(units.chain(), "unit", "id");

		var flowsDT = db.getCollection("flows");
		datatypes = db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({ id: flow_id, }).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatypeName = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.name : null;
		let dt = getFieldsFromDatatype(datatypeName, false, false);

		let group_by = "";
		if (typeof group !== "undefined") {
			group_by = sprintf("GROUP BY time(%s)", group);
		}

		query = `SELECT MEAN(${dt}) as mean, PERCENTILE(${dt},25) as "q1", PERCENTILE(${dt},50) as "q2", PERCENTILE(${dt},75) as "q3" FROM data WHERE flow_id='${flow_id}' ${where} ${group_by}`;
		t6console.log(sprintf("Query: %s", query));

		dbInfluxDB.query(query).then(data => {
			if (data.length > 0) {
				var graphData = [];
				let svg;

				data.map(function(row) {
					if (typeof row.time !== "undefined") {
						graphData.push({ key: moment(row.time._nanoISO), value: row.mean }); // TODO : security	
					}
				});
				var D3Node = require('d3-node');
				const d3n = new D3Node({
					selector: "",
					svgStyles: "",
					container: "",
				});
				const d3 = d3n.d3;
				let _margin = { top: 20, right: 10, bottom: 60, left: 50 };
				let _lineWidth = 1.5;
				let _isCurve = true;
				let _tickSize = 5;
				let _tickPadding = 5;
				let _lineColor = 'steelblue';
				let _lineColors = ['steelblue'];
				let sidePlotWidth = 300;

				svg = d3n.createSVG(width, height)
					.append('g')
					.attr('transform', `translate(${_margin.left}, ${_margin.top})`);
				width = width - _margin.left - _margin.right;
				height = height - _margin.top - _margin.bottom;

				const g = svg.append('g');

				const { allKeys } = graphData;
				const xScale = d3.scaleTime()
					.domain(allKeys ? d3.extent(allKeys) : d3.extent(graphData, d => d.key))
					.range([0, width - sidePlotWidth]);
				const yScale = d3.scaleLinear()
					.domain(allKeys ? [d3.min(graphData, d => d3.min(d, v => v.value)), d3.max(graphData, d => d3.max(d, v => v.value))] : d3.extent(graphData, d => d.value))
					.rangeRound([height, 0]);
				const xAxis = d3.axisBottom(xScale)
					.tickSize(_tickSize)
					.tickPadding(_tickPadding);
				const yAxis = d3.axisLeft(yScale)
					.tickSize(_tickSize)
					.tickPadding(_tickPadding);
				const lineChart = d3.line()
					.x(d => xScale(d.key))
					.y(d => yScale(d.value));

				if (_isCurve) lineChart.curve(d3.curveBasis);

				g.append('g')
					.attr('transform', `translate(0, ${height})`)
					.call(xAxis)
					.selectAll("text")
					.attr("transform", `translate(-10, 0)rotate(-45)`)
					.style("text-anchor", "end");

				g.append('g').call(yAxis);

				let m = 10; // margin 2
				let barHeight = (height / 4) - 2 * m;
				let w, p;
				let totalValues = graphData.length;
				let min = d3.min(graphData.map(function(d) { return (d.value) }));
				let q1 = d3.quantile(graphData.map(function(d) { return (d.value) }), .25);
				let q2 = d3.quantile(graphData.map(function(d) { return (d.value) }), .5);
				let q3 = d3.quantile(graphData.map(function(d) { return (d.value) }), .75);
				let max = d3.max(graphData.map(function(d) { return (d.value) }));

				w = (graphData.filter(function(d) { return (d.value > q3 && d.value < max) }).length) * sidePlotWidth / totalValues;
				p = ((graphData.filter(function(d, i) { return (d.value > q3 && d.value < max) }).length) / totalValues).toFixed(1);
				g.append("rect").attr('x', width - 290).attr('y', 1 * (barHeight + m) + m).attr('width', w).attr('height', barHeight).attr('fill', (d, i) => i < _lineColors.length ? _lineColors[i] : _lineColor);
				g.append('text')
					.attr('x', width - 290 + m)
					.attr('y', 1 * (barHeight + m))
					.attr("font-size", "11px")
					.text(`${q3.toFixed(4)} < value < ${max.toFixed(4)} : ${p}%`);

				w = (graphData.filter(function(d) { return (d.value > q2 && d.value < q3) }).length) * sidePlotWidth / totalValues;
				p = ((graphData.filter(function(d, i) { return (d.value > q2 && d.value < q3) }).length) / totalValues).toFixed(1);
				g.append("rect").attr('x', width - 290).attr('y', 2 * (barHeight + m) + m).attr('width', w).attr('height', barHeight).attr('fill', (d, i) => i < _lineColors.length ? _lineColors[i] : _lineColor);
				g.append('text')
					.attr('x', width - 290 + m)
					.attr('y', 2 * (barHeight + m))
					.attr("font-size", "11px")
					.text(`${q2.toFixed(4)} < value < ${q3.toFixed(4)} : ${p}%`);

				w = (graphData.filter(function(d) { return (d.value > q1 && d.value < q2) }).length) * sidePlotWidth / totalValues;
				p = ((graphData.filter(function(d, i) { return (d.value > q1 && d.value < q2) }).length) / totalValues).toFixed(1);
				g.append("rect").attr('x', width - 290).attr('y', 3 * (barHeight + m) + m).attr('width', w).attr('height', barHeight).attr('fill', (d, i) => i < _lineColors.length ? _lineColors[i] : _lineColor);
				g.append('text')
					.attr('x', width - 290 + m)
					.attr('y', 3 * (barHeight + m))
					.attr("font-size", "11px")
					.text(`${q1.toFixed(4)} < value < ${q2.toFixed(4)} : ${p}%`);

				w = (graphData.filter(function(d, i) { return (d.value > min && d.value < q1) }).length) * sidePlotWidth / totalValues;
				p = ((graphData.filter(function(d, i) { return (d.value > min && d.value < q1) }).length) / totalValues).toFixed(1);
				g.append("rect").attr('x', width - 290).attr('y', 4 * (barHeight + m) + m).attr('width', w).attr('height', barHeight).attr('fill', (d, i) => i < _lineColors.length ? _lineColors[i] : _lineColor);
				g.append('text')
					.attr('x', width - 290 + m)
					.attr('y', 4 * (barHeight + m))
					.attr("font-size", "11px")
					.text(`${min.toFixed(4)} < value < ${q1.toFixed(4)} : ${p}%`);

				g.append('g')
					.attr('fill', 'none')
					.attr('stroke-width', _lineWidth)
					.selectAll('path')
					.data(allKeys ? data : [graphData])
					.enter().append("path")
					.attr('stroke', (d, i) => i < _lineColors.length ? _lineColors[i] : _lineColor)
					.attr('d', lineChart);

				res.setHeader("content-type", "image/svg+xml");
				res.status(200).send(d3n.svgString());
			} else {
				res.status(404).send({ err: "No data found", "id": 898.5, "code": 404, "message": "Not found" });
			}
		}).catch(err => {
			res.status(500).send({ err: err, "id": 898, "code": 500, "message": "Internal Error" });
		});
	}
});

/**
 * @api {get} /exploration/xxxxxx Trend 
 * 
 * 
 */

/**
 * @api {get} /exploration/xxxxxx Seasonality 
 * 
 * 
 */

/**
 * @api {get} /exploration/xxxxxx Outliers 
 * 
 * 
 */

/**
 * @api {get} /exploration/:flow_id/exploration Get Exploration
 * @apiName Explore Flows
 * @apiGroup 10 Exploratory Data Analysis (EDA)
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to get data from
 * @apiParam {String} [sort=desc] Set to sorting order, the value can be either "asc" or ascending or "desc" for descending.
 * @apiParam {Number} [page] Page offset
 * @apiParam {Integer} [start] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Integer} [end] Timestamp or formatted date YYYY-MM-DD HH:MM:SS
 * @apiParam {Number{1-5000}} [limit] Set the number of expected resources.
 * @apiParam {String="min","max","first","last","sum","count"} [select] Modifier function to modify the results
 * @apiParam {String="10ns, 100µ, 3600ms, 3600s, 1m, 3h, 4d, 2w, 365d"} [group] Group By Clause
 * @apiParam {String} [dateFormat] See momentJs documentation to foarmat date displays
 * @apiParam {String="bar","line","pie","voronoi"} graphType Type of graph
 * @apiParam {String} [xAxis] Label value in X axis
 * @apiParam {String} [yAxis] Label value in Y axis
 * @apiParam {Integer} [width] output width of SVG chart
 * @apiParam {Integer} [height] output height of SVG chart
 * @apiParam {Integer} [ticks=10] Ticks
 * @apiSuccess {Object[]} data DataPoint from the Flow
 * @apiSuccess {Object[]} data Data point Object
 * @apiSuccess {String} data.type Data point Type
 * @apiSuccess {Number} data.id Data point Identifier
 * @apiSuccess {Object[]} data.links
 * @apiSuccess {String} data.links.self Data point Url
 * @apiSuccess {Object[]} data.attributes Data point attributes
 * @apiSuccess {Number} data.attributes.time Time of Data point 
 * @apiSuccess {Number} data.attributes.timestamp Unix Timestamp of Data point 
 * @apiSuccess {String} data.attributes.value Value of Data point
 * @apiUse 200
 * @apiUse 401
 * @apiUse 404
 * @apiUse 405
 * @apiUse 429
 * @apiUse 500
 */
router.get("/:flow_id([0-9a-z\-]+)/exploration/?", expressJwt({ secret: jwtsettings.secret, algorithms: jwtsettings.algorithms }), function(req, res) {
	var flow_id = req.params.flow_id;
	var select = typeof req.query.select ? req.query.select : undefined;
	var group = req.query.group;
	var dateFormat = req.query.dateFormat;
	var graphType = req.query.graphType;
	var xAxis = typeof req.query.xAxis ? req.query.xAxis : "";
	var yAxis = typeof req.query.yAxis ? req.query.yAxis : "";
	var width = parseInt(req.query.width, 10);
	var height = parseInt(req.query.height, 10);
	var ticks = typeof req.query.ticks !== "undefined" ? req.query.ticks : 10;
	var query;
	var start;
	var end;
	if (!flow_id) {
		res.status(405).send(new ErrorSerializer({ "id": 56, "code": 405, "message": "Method Not Allowed" }).serialize());
	} else {
		flows = db.getCollection("flows");
		units = db.getCollection("units");

		let where = "";

		if (typeof req.query.start !== "undefined") {
			if (!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if (req.query.start.toString().length === 10) { start = req.query.start * 1e9; }
				else if (req.query.start.toString().length === 13) { start = req.query.start * 1e6; }
				else if (req.query.start.toString().length === 16) { start = req.query.start * 1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}
		if (typeof req.query.end !== "undefined") {
			if (!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if (req.query.end.toString().length === 10) { end = req.query.end * 1e9; }
				else if (req.query.end.toString().length === 13) { end = req.query.end * 1e6; }
				else if (req.query.end.toString().length === 16) { end = req.query.end * 1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}

		var sorting = req.query.order === "asc" ? "ASC" : (req.query.sort === "asc" ? "ASC" : "DESC");
		var page = parseInt(req.query.page, 10);
		if (isNaN(page) || page < 1) {
			page = 1;
		}
		var limit = parseInt(req.query.limit, 10);
		if (isNaN(limit)) {
			limit = 10;
		} else if (limit > 5000) {
			limit = 5000;
		} else if (limit < 1) {
			limit = 1;
		}

		var flow = flows.chain().find({ "id": { "$aeq": flow_id } }).limit(1);
		var join = flow.eqJoin(units.chain(), "unit", "id");

		var flowsDT = db.getCollection("flows");
		datatypes = db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({ id: flow_id, }).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatype = typeof (joinDT.data())[0] !== "undefined" ? (joinDT.data())[0].right.name : null;
		let fields;

		fields = getFieldsFromDatatype(datatype, false);
		var statistics = require("simple-statistics");
		let dt = getFieldsFromDatatype(datatype, false, false);
		if (typeof select !== "undefined") { // TODO: needs refacto and allows multiple coma separated values
			fields = "";
			switch (select) {
				case "min": fields += sprintf("MIN(%s) as min", dt); break;
				case "max": fields += sprintf("MAX(%s) as max", dt); break;
				case "first": fields += sprintf("FIRST(%s) as first", dt); break;
				case "last": fields += sprintf("LAST(%s) as last", dt); break;
				case "sum": fields = sprintf("SUM(%s) as sum", dt); break;
				case "count": fields = sprintf("COUNT(%s) as count", dt); break;
				case "median": fields += sprintf("MEDIAN(%s) as median", dt); break;
				case "mean": fields += sprintf("MEAN(%s) as mean", dt); break;
			}
		} else {
			fields = sprintf("FIRST(%s) as first, LAST(%s) as last, COUNT(%s) as count, MEAN(%s) as mean, STDDEV(%s) as stddev, MIN(%s) as min, MAX(%s) as max, PERCENTILE(%s, 25) as q1, PERCENTILE(%s, 50) as q2, PERCENTILE(%s, 75) as q3", dt, dt, dt, dt, dt, dt, dt, dt, dt, dt, dt);
		}

		let group_by = "";
		if (typeof group !== "undefined") {
			group_by = sprintf("GROUP BY time(%s)", group);
		}

		query = sprintf("SELECT %s FROM data WHERE flow_id='%s' %s %s ORDER BY time %s LIMIT %s OFFSET %s", fields, flow_id, where, group_by, sorting, limit, (page - 1) * limit);
		t6console.log(sprintf("Query: %s", query));

		dbInfluxDB.query(query).then(data => {
			if (data.length > 0) {
				var graphData = [];
				let svg;
				if (graphType === "bar") {
					var d3nBar = require("d3node-barchart");
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							graphData.push({ key: moment(row.time._nanoISO).format(typeof dateFormat !== "undefined" ? dateFormat : "YYYY MM DD"), value: row[select] }); // TODO : security	
						}
					});
					svg = d3nBar({
						data: graphData,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				} else if (graphType === "scatterplot") {
					var d3nScatter = require("d3node-scatterplot");
					let n = 0;
					data.map(function(row) {
						if (typeof row.time !== "undefined" && row[select] != null) {
							graphData.push({ key: n, value: row[select] }); // TODO : security
							n++;
						}
					});
					svg = d3nScatter({
						data: graphData,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				} else if (graphType === "bell") {

				} else if (graphType === "boxplot") {
					var d3nBoxplot = require("d3node-boxplot");
					let boxplotData = {};
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							boxplotData.q1 = row.q1;
							boxplotData.median = row.mean;
							boxplotData.q3 = row.q3;
							boxplotData.min = row.min;
							boxplotData.max = row.max;
						}
					});
					svg = d3nBoxplot({
						data: boxplotData,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				} else if (graphType === "line") {
					var d3nLine = require("d3node-linechart");
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							graphData.push({ key: moment(row.time._nanoISO), value: row[select] }); // TODO : security	
						}
					});
					svg = d3nLine({
						data: graphData,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				} else if (graphType === "voronoi") {
					var d3nVoronoi = require("d3node-voronoi");
					let n = 0;
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							graphData.push(row[select]); // TODO : security	
							n++;
						}
					});
					svg = d3nVoronoi(graphData);
				} else if (graphType === "pie") {
					var d3nPie = require("d3node-piechart");
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							graphData.push({ label: moment(row.time._nanoISO).format(typeof dateFormat !== "undefined" ? dateFormat : "YYYY MM DD"), value: row[select] }); // TODO : security	
						}
					});
					svg = d3nPie({
						data: graphData,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				} else if (graphType === "kernelDensityEstimation") {
					var d3nBar = require("d3node-barchart");
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							graphData.push(row[select]); // TODO : security	
						}
					});
					let dataDensity = new Array();
					let densityFunc = statistics.kernelDensityEstimation(graphData);
					let step = Math.round(statistics.max(graphData) - statistics.min(graphData), 0) / ticks;
					for (let n = statistics.min(graphData); n < statistics.max(graphData); n += step) {
						dataDensity.push({ key: Math.round(n * 100 / 100), value: densityFunc(n) });
					}
					t6console.log(dataDensity);
					svg = d3nBar({
						data: dataDensity,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				} else if (graphType === "histogram") {
					data.map(function(row) {
						if (typeof row.time !== "undefined") {
							graphData.push(row[select]); // TODO : security	
						}
					});
					let dataDistribution = new Array();
					let densityFunc = statistics.kernelDensityEstimation(graphData);
					let step = Math.round(statistics.max(graphData) - statistics.min(graphData), 0) / ticks;
					for (let n = statistics.min(graphData); n < statistics.max(graphData); n += step) {
						dataDensity.push({ key: Math.round(n * 100 / 100), value: densityFunc(n) });
					}
					t6console.log(dataDistribution);
					svg = d3nBar({
						data: dataDistribution,
						selector: "",
						container: "",
						labels: { xAxis: xAxis, yAxis: yAxis },
						width: width,
						height: height,
					});
				}

				res.setHeader("content-type", "image/svg+xml");
				res.status(200).send(svg.svgString());
			} else {
				res.status(404).send({ err: "No data found", "id": 898.5, "code": 404, "message": "Not found" });
			}
		}).catch(err => {
			res.status(500).send({ err: err, "id": 898, "code": 500, "message": "Internal Error" });
		});
	}
});

module.exports = router;