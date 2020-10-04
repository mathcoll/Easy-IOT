"use strict";
var express = require("express");
var router = express.Router();
var DataSerializer = require("../serializers/data");
var ErrorSerializer = require("../serializers/error");
var flows;
var objects;
var datatypes;
var units;

function str2bool(v) {
	return ["yes", "true", "t", "1", "y", "yeah", "on", "yup", "certainly", "uh-huh"].indexOf(v)>-1?true:false;
}
function getJson(v) {
	try {
		return JSON.parse(v);
	} catch (e) {
		return v;
	}
}
function decryptPayload(encryptedPayload, sender, encoding) {
	if ( sender && sender.secret_key_crypt ) {
		var decryptedPayload;
		var key = Buffer.from(sender.secret_key_crypt, "hex");
		let textParts = encryptedPayload.split(":");
		let iv = Buffer.from(textParts.shift(), "hex");
		encryptedPayload = textParts.shift();

		let decipher = crypto.createDecipheriv(algorithm, key, iv);
		decipher.setAutoPadding(true);
		decryptedPayload = decipher.update(encryptedPayload, "base64", encoding || "utf8");// ascii, binary, base64, hex, utf8
		decryptedPayload += decipher.final(encoding || "utf8");

		//t6console.log("\nPayload decrypted:\n decryptedPayload);
		return decryptedPayload!==""?decryptedPayload:false;
	} else {
		//t6console.log("decryptPayload Error: Missing secret_key_crypt");
		return false;
	}
}
function getFieldsFromDatatype(datatype, asValue, includeTime=true) {
	let fields;
	if( includeTime ) {
		fields += "time, ";
	}
	if ( datatype === "boolean" ) {
		fields = "valueBoolean";
	} else if ( datatype === "date" ) {
		fields = "valueDate";
	} else if ( datatype === "integer" ) {
		fields = "valueInteger";
	} else if ( datatype === "json" ) {
		fields = "valueJson";
	} else if ( datatype === "string" ) {
		fields = "valueString";
	} else if ( datatype === "time" ) {
		fields = "valueTime";
	} else if ( datatype === "float" ) {
		fields = "valueFloat";
	} else if ( datatype === "geo" ) {
		fields = "valueString";
	} else {
		fields = "value";
	}
	if( asValue ) {
		fields += " as value";
	}
	return fields;
}

/**
 * @api {get} /data/:flow_id/eploration Get Exploration
 * @apiName Get Exploration
 * @apiGroup 0 DataPoint
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to get data from
 * @apiParam {uuid-v4} [flow_id] Datapoint ID
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
router.get("/:flow_id([0-9a-z\-]+)/exploration/?", expressJwt({secret: jwtsettings.secret, algorithms: jwtsettings.algorithms}), function (req, res) {
	var flow_id = req.params.flow_id;
	var select = req.query.select;
	var group = req.query.group;
	var dateFormat = req.query.dateFormat;
	var graphType = req.query.graphType;
	var xAxis = req.query.xAxis;
	var yAxis = req.query.yAxis;
	var width = req.query.width;
	var height = req.query.height;
	var ticks = typeof req.query.ticks!=="undefined"?req.query.ticks:10;
	var query;
	var start;
	var end;
	
	if ( !flow_id ) {
		res.status(405).send(new ErrorSerializer({"id": 56, "code": 405, "message": "Method Not Allowed"}).serialize());
	} else {
		flows = db.getCollection("flows");
		units	= db.getCollection("units");

		let where = "";

		if ( typeof req.query.start !== "undefined" ) {
			if(!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if ( req.query.start.toString().length === 10 ) { start = req.query.start*1e9; }
				else if ( req.query.start.toString().length === 13 ) { start = req.query.start*1e6; }
				else if ( req.query.start.toString().length === 16 ) { start = req.query.start*1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}	
		if ( typeof req.query.end !== "undefined" ) {
			if(!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if ( req.query.end.toString().length === 10 ) { end = req.query.end*1e9; }
				else if ( req.query.end.toString().length === 13 ) { end = req.query.end*1e6; }
				else if ( req.query.end.toString().length === 16 ) { end = req.query.end*1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}

		var sorting = req.query.order==="asc"?"ASC":(req.query.sort==="asc"?"ASC":"DESC");
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

		var flow = flows.chain().find({ "id" : { "$aeq" : flow_id } }).limit(1);
		var join = flow.eqJoin(units.chain(), "unit", "id");

		var flowsDT = db.getCollection("flows");
		datatypes	= db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({id: flow_id,}).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatype = typeof (joinDT.data())[0]!=="undefined"?(joinDT.data())[0].right.name:null;
		let fields;

		fields = getFieldsFromDatatype(datatype, false);
		var statistics = require("simple-statistics");
		let dt = getFieldsFromDatatype(datatype, false, false);
		if ( typeof select!=="undefined" ) { // TODO: needs refacto and allows multiple coma separated values
			fields = "";
			switch(select) {
				case "min": fields += sprintf("MIN(%s) as min", dt);break;
				case "max": fields += sprintf("MAX(%s) as max", dt);break;
				case "first": fields += sprintf("FIRST(%s) as first", dt);break;
				case "last": fields += sprintf("LAST(%s) as last", dt);break;
				case "sum": fields = sprintf("SUM(%s) as sum", dt);break;
				case "count": fields = sprintf("COUNT(%s) as count", dt);break;
				case "median": fields += sprintf("MEDIAN(%s) as median", dt);break;
				case "mean": fields += sprintf("MEAN(%s) as mean", dt);break;
			}
		} else {
			fields = sprintf("FIRST(%s) as first, LAST(%s) as last, COUNT(%s) as count, MEAN(%s) as mean, STDDEV(%s) as stddev, MIN(%s) as min, MAX(%s) as max, PERCENTILE(%s, 25) as p25, PERCENTILE(%s, 50) as p50, PERCENTILE(%s, 75) as p75", dt, dt, dt, dt, dt, dt, dt, dt, dt, dt);
		}

		let group_by = "";
		if(typeof group!=="undefined") {
			group_by = sprintf("GROUP BY time(%s)", group);
		}

		query = sprintf("SELECT %s FROM data WHERE flow_id='%s' %s %s ORDER BY time %s LIMIT %s OFFSET %s", fields, flow_id, where, group_by, sorting, limit, (page-1)*limit);
		t6console.log(sprintf("Query: %s", query));

		dbInfluxDB.query(query).then(data => {
			if ( data.length > 0 ) {
				var graphData = [];
				let svg;
				if(graphType === "bar") {
					var d3nBar = require("d3node-barchart");
					data.map(function(row) {
						if (typeof row.time!=="undefined") {
							graphData.push({key: moment(row.time._nanoISO).format(typeof dateFormat!=="undefined"?dateFormat:"YYYY MM DD"), value: row[select]}); // TODO : security	
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
				} else if(graphType === "line") {
					var d3nLine = require("d3node-linechart");
					data.map(function(row) {
						if (typeof row.time!=="undefined") {
							graphData.push({key: moment(row.time._nanoISO), value: row[select]}); // TODO : security	
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
				} else if(graphType === "voronoi") {
					var d3nVoronoi = require("d3node-voronoi");
					let n=0;
					data.map(function(row) {
						if (typeof row.time!=="undefined") {
							graphData.push(row[select]); // TODO : security	
							n++;
						}
					});
					svg = d3nVoronoi(graphData);
				} else if(graphType === "pie") {
					var d3nPie = require("d3node-piechart");
					data.map(function(row) {
						if (typeof row.time!=="undefined") {
							graphData.push({label: moment(row.time._nanoISO).format(typeof dateFormat!=="undefined"?dateFormat:"YYYY MM DD"), value: row[select]}); // TODO : security	
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
				} else if(graphType === "kernelDensityEstimation") {
					data.map(function(row) {
						if (typeof row.time!=="undefined") {
							graphData.push(row[select]); // TODO : security	
						}
					});
					let dataDensity = new Array();
					let densityFunc = statistics.kernelDensityEstimation(graphData);
					let step = Math.round(statistics.max(graphData) - statistics.min(graphData), 0)/ticks;
					for(let n=statistics.min(graphData); n<statistics.max(graphData); n+=step) {
						dataDensity.push({key: Math.round(n*100/100), value: densityFunc(n)});
					}
					svg = d3nBar({
						data: dataDensity,
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
				res.status(404).send({err: "No data found", "id": 898.5, "code": 404, "message": "Not found"});
			}
		}).catch(err => {
			res.status(500).send({err: err, "id": 898, "code": 500, "message": "Internal Error"});
		});
	}
});

/**
 * @api {get} /data/:flow_id/:data_id? Get DataPoint(s)
 * @apiName Get DataPoint(s)
 * @apiGroup 0 DataPoint
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to get data from
 * @apiParam {uuid-v4} [flow_id] Datapoint ID
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
router.get("/:flow_id([0-9a-z\-]+)/?(:data_id([0-9a-z\-]+))?", expressJwt({secret: jwtsettings.secret, algorithms: jwtsettings.algorithms}), function (req, res) {
	var flow_id = req.params.flow_id;
	var data_id = req.params.data_id;
	var modifier = req.query.modifier;
	var query;
	var start;
	var end;
	
	if ( !flow_id ) {
		res.status(405).send(new ErrorSerializer({"id": 56, "code": 405, "message": "Method Not Allowed"}).serialize());
	} else {
		flows = db.getCollection("flows");
		units	= db.getCollection("units");

		let where = "";
		if ( data_id ) {
			if ( data_id.toString().length === 10 ) { data_id *= 1e9; }
			else if ( data_id.toString().length === 13 ) { data_id *= 1e6; }
			else if ( data_id.toString().length === 16 ) { data_id *= 1e3; }
			where += sprintf(" AND time=%s", data_id);
		}

		if ( typeof req.query.start !== "undefined" ) {
			if(!isNaN(req.query.start) && parseInt(req.query.start, 10)) {
				if ( req.query.start.toString().length === 10 ) { start = req.query.start*1e9; }
				else if ( req.query.start.toString().length === 13 ) { start = req.query.start*1e6; }
				else if ( req.query.start.toString().length === 16 ) { start = req.query.start*1e3; }
				where += sprintf(" AND time>=%s", parseInt(start, 10));
			} else {
				where += sprintf(" AND time>='%s'", req.query.start.toString());
			}
		}	
		if ( typeof req.query.end !== "undefined" ) {
			if(!isNaN(req.query.end) && parseInt(req.query.end, 10)) {
				if ( req.query.end.toString().length === 10 ) { end = req.query.end*1e9; }
				else if ( req.query.end.toString().length === 13 ) { end = req.query.end*1e6; }
				else if ( req.query.end.toString().length === 16 ) { end = req.query.end*1e3; }
				where += sprintf(" AND time<=%s", parseInt(end, 10));
			} else {
				where += sprintf(" AND time<='%s'", req.query.end.toString());
			}
		}

		var sorting = req.query.order==="asc"?"ASC":(req.query.sort==="asc"?"ASC":"DESC");
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

		var flow = flows.chain().find({ "id" : { "$aeq" : flow_id } }).limit(1);
		var join = flow.eqJoin(units.chain(), "unit", "id");

		var flowsDT = db.getCollection("flows");
		datatypes	= db.getCollection("datatypes");
		var flowDT = flowsDT.chain().find({id: flow_id,}).limit(1);
		var joinDT = flowDT.eqJoin(datatypes.chain(), "data_type", "id");
		var datatype = typeof (joinDT.data())[0]!=="undefined"?(joinDT.data())[0].right.name:null;
		let fields;

		if ( typeof modifier!=="undefined" ) {
			fields = getFieldsFromDatatype(datatype, false);
			switch(modifier) {
				case "min": fields += ", MIN(valueFloat) as value";break;
				case "max": fields += ", MAX(valueFloat) as value";break;
				case "first": fields += ", FIRST(valueFloat) as value";break;
				case "last": fields += ", LAST(valueFloat) as value";break;
				case "sum": fields = "SUM(valueFloat) as value";break;
				case "count": fields = "COUNT(valueFloat) as value";break;
				//case "median": fields += ", MEDIAN(valueFloat)";break;
				//case "mean": fields += ", MEAN(valueFloat)";break;
			}
		} else {
			fields = getFieldsFromDatatype(datatype, true, true);
		}

		let group_by = "";
		if(typeof group!=="undefined") {
			group_by = sprintf("GROUP BY time(%s)", group);
		}

		query = sprintf("SELECT %s FROM data WHERE flow_id='%s' %s %s ORDER BY time %s LIMIT %s OFFSET %s", fields, flow_id, where, group_by, sorting, limit, (page-1)*limit);
		t6console.log(sprintf("Query: %s", query));

		dbInfluxDB.query(query).then(data => {
			if ( data.length > 0 ) {
				data.map(function(d) {
					d.id = sprintf("%s/%s", flow_id, moment(d.time).format("x")*1000);
					d.timestamp = Date.parse(d.time);
					d.time = Date.parse(d.time);
				});
				data.title = ((join.data())[0].left)!==null?((join.data())[0].left).name:"";
				data.unit = ((join.data())[0].right)!==null?((join.data())[0].right).format:"";
				data.mqtt_topic = ((join.data())[0].left).mqtt_topic;
				data.ttl = 3600; // TODO
				data.flow_id = flow_id;
				data.pageSelf = page;
				data.pageNext = page+1;
				data.pagePrev = page-1;
				data.sort = typeof req.query.sort!=="undefined"?req.query.sort:"asc";
				let total = 9999999999999;//TODO, we should get total from influxdb
				data.pageLast = Math.ceil(total/limit);
				data.limit = limit;
				
				data.group = undefined;
				data.groupRows = undefined;
				data.groupsTagsKeys = undefined;
				data.groups = undefined;

				res.status(200).send(new DataSerializer(data).serialize());
			} else {
				res.status(404).send({err: "No data found", "id": 899.5, "code": 404, "message": "Not found"});
			}
		}).catch(err => {
			res.status(500).send({err: err, "id": 899, "code": 500, "message": "Internal Error"});
		});
	}
});

/**
 * @api {post} /data/:flow_id Create a DataPoint
 * @apiName Create a DataPoint
 * @apiDescription Create a DataPoint to t6. This needs to post the datapoint over a flow from your own collection.
 * The payload can be crypted using aes-256-cbc algorithm and optionally signed as well. Using both encrypting and signature require to sign the payload first and then to encrypt the new payload as an enveloppe.
 * On both Sign & Encrypt, it is required to claim the object_id in the body so that the symmetric Secret Key can be found on the object as well as the Crypt Secret.
 * @apiGroup 0 DataPoint
 * @apiVersion 2.0.1
 *
 * @apiUse Auth
 * 
 * @apiParam {uuid-v4} flow_id Flow ID you want to add Data Point to
 * @apiParam {String} value Data Point value
 * @apiParam {Boolean} [publish=true] Flag to publish to Mqtt Topic ; This parameter might become deprecated.
 * @apiParam {Boolean} [save=false] Flag to store in database the Value
 * @apiParam {String} [unit=undefined] Unit of the Value
 * @apiParam {String} [mqtt_topic="Default value from the Flow resource"] Mqtt Topic to publish value
 * @apiParam {String} [text=undefined] Optional text to qualify Value
 * @apiParam {uuid-v4} [object_id=undefined] Optional object_id uuid used for Signed payload; for decrypt and encrypting in the Mqtt; The object_id must be own by the user in JWT.
 * @apiParam {String} [latitude="39.800327"] Optional String to identify where does the datapoint is coming from. (This is only used for rule specific operator)
 * @apiParam {String} [longitude="6.343530"] Optional String to identify where does the datapoint is coming from. (This is only used for rule specific operator)
 * @apiParam {String} [signedPayload=undefined] Optional Signed payload containing datapoint resource
 * @apiParam {String} [encryptedPayload=undefined] Optional Encrypted payload containing datapoint resource
 * @apiUse 200
 * @apiUse 201
 * @apiUse 401
 * @apiUse 401sign
 * @apiUse 405
 * @apiUse 412
 * @apiUse 429
 * @apiUse 500
 */
router.post("/(:flow_id([0-9a-z\-]+))?", expressJwt({secret: jwtsettings.secret, algorithms: jwtsettings.algorithms}), function (req, res, next) {
	let payload = req.body;
	let error;
	let isEncrypted = false;
	let isSigned = false;
	let prerequisite = 0;
	var object_id = payload.object_id;

	if ( payload.signedPayload || payload.encryptedPayload ) {
		var cert = jwtsettings.secret; //- fs.readFileSync("private.key");
		objects	= db.getCollection("objects");

		var query;
		if ( typeof object_id !== "undefined" ) {
			query = {
			"$and": [
					{ "user_id" : req.user.id },
					{ "id" : object_id },
				]
			};
			var object = objects.findOne(query);
			if ( object && object.secret_key ) {
				cert = object.secret_key;
			}
		}

		if ( payload.encryptedPayload ) {
			// The payload is encrypted
			isEncrypted = true;
			let decrypted = decryptPayload(payload.encryptedPayload.trim(), object); // ascii, binary, base64, hex, utf8
			payload = decrypted!==false?decrypted:payload;
			payload = getJson(payload);
		}

		if ( typeof payload !== "undefined" && payload.signedPayload ) {
			// The payload is signed
			isSigned = true;
			jwt.verify(payload.signedPayload, cert, function(err, decoded) {
				if ( !err ) {
					payload = decoded;
					if ( payload.encryptedPayload ) {
						// The payload is encrypted
						isEncrypted = true;
						let decrypted = decryptPayload(payload.encryptedPayload.trim(), object); // ascii, binary, base64, hex, utf8
						payload = decrypted!==false?decrypted:payload;
					}
				} else {
					payload = undefined;
					error = err;
					t6console.error("Error "+error);
					res.status(401).send(new ErrorSerializer({"id": 62.4, "code": 401, "message": "Invalid Signature",}).serialize());
					next();
				}
			});
		}
	}
	
	if ( typeof payload !== "undefined" && !error ) {
		payload = getJson(payload);
		var flow_id		= typeof req.params.flow_id!=="undefined"?req.params.flow_id:payload.flow_id;
		var time		= (payload.timestamp!=="" && typeof payload.timestamp!=="undefined")?parseInt(payload.timestamp, 10):moment().format("x");
		if ( time.toString().length <= 10 ) { time = moment(time*1000).format("x"); }
		var value		= typeof payload.value!=="undefined"?payload.value:"";
		var publish		= typeof payload.publish!=="undefined"?JSON.parse(payload.publish):true;
		var save		= typeof payload.save!=="undefined"?JSON.parse(payload.save):true;
		var unit		= typeof payload.unit!=="undefined"?payload.unit:"";
		var mqtt_topic	= typeof payload.mqtt_topic!=="undefined"?payload.mqtt_topic:"";
		var latitude	= typeof payload.latitude!=="undefined"?payload.latitude:"";
		var longitude	= typeof payload.longitude!=="undefined"?payload.longitude:"";
		var text		= typeof payload.text!=="undefined"?payload.text:"";

		if ( !flow_id || !req.user.id ) {
			// Not Authorized because token is invalid
			res.status(401).send(new ErrorSerializer({"id": 64, "code": 401, "message": "Not Authorized",}).serialize());
		} else {
			flows		= db.getCollection("flows");
			datatypes	= db.getCollection("datatypes");
			var f = flows.chain().find({id: ""+flow_id,}).limit(1);
			var join = f.eqJoin(datatypes.chain(), "data_type", "id");
			if ( !mqtt_topic && (f.data())[0] && (f.data())[0].left && (f.data())[0].left.mqtt_topic ) {
				mqtt_topic = (f.data())[0].left.mqtt_topic;
			}
			var datatype = typeof (join.data())[0]!=="undefined"?(join.data())[0].right.name:null;
			if ( typeof (f.data())[0]!=="undefined" && (f.data())[0].left.require_encrypted && !isEncrypted ) {
				//t6console.log("(f.data())[0].left", (f.data())[0].left);
				prerequisite += 1;
			}
			if ( typeof (f.data())[0]!=="undefined" && (f.data())[0].left.require_signed && !isSigned ) {
				//t6console.log("(f.data())[0].left", (f.data())[0].left);
				prerequisite += 1;
			}
			/*
			t6console.debug("payload=", payload);
			t6console.debug("Flow require isSigned -", (f.data())[0].left.require_signed);
			t6console.debug(".. & Payload isSigned", isSigned);
			t6console.debug("Flow require isEncrypted -", (f.data())[0].left.require_encrypted);
			t6console.debug(".. & Payload isEncrypted", isEncrypted);
			t6console.debug("Prerequisite Index=", prerequisite, "(>0 means something is required.)");
			*/
			if ( prerequisite <= 0 ) {
				// Cast value according to Flow settings
				var fields = [];
				if ( datatype == "boolean" ) {
					value = str2bool(value);
					fields[0] = {time:""+time, valueBoolean: value,};
				} else if ( datatype == "date" ) {
					value = value;
					fields[0] = {time:""+time, valueDate: value,};
				} else if ( datatype == "integer" ) {
					value = parseInt(value, 10);
					fields[0] = {time:""+time, valueInteger: value+"i",};
				} else if ( datatype == "json" ) {
					value = {value:value,};
					fields[0] = {time:""+time, valueJson: value,};
				} else if ( datatype == "string" ) {
					value = ""+value;
					fields[0] = {time:""+time, valueString: value,};
				} else if ( datatype == "time" ) {
					value = value;
					fields[0] = {time:""+time, valueTime: value,};
				} else if ( datatype == "float" ) {
					value = parseFloat(value);
					fields[0] = {time:""+time, valueFloat: value,};
				} else if ( datatype == "geo" ) {
					value = ""+value;
					fields[0] = {time:""+time, valueString: value,};
				} else {
					value = ""+value;
					fields[0] = {time:""+time, valueString: value,};
				}
				// End casting
				
				/*
				t6console.debug("value = "+ value);
				t6console.debug("datatype = "+ datatype);
				t6console.debug("text = "+ text);
				t6console.debug("influxdb = "+ db_type.influxdb);
				t6console.debug("save = "+ save);
				t6console.debug("tags = "+ tags);
				t6console.debug("fields = "+ fields[0]);
				t6console.debug("timestamp = "+ timestamp);
				*/
				if ( save === true ) {
					if ( db_type.influxdb === true ) {
						/* InfluxDB database */
						var tags = {};
						var timestamp = time*1000000;
						if (flow_id!== "") {
							tags.flow_id = flow_id;
						}
						tags.user_id = req.user.id;
						if (text!== "") {
							fields[0].text = text;
						}

						dbInfluxDB.writePoints([{
							measurement: "data",
							tags: tags,
							fields: fields[0],
							timestamp: timestamp,
						}], { retentionPolicy: "autogen", }).then(err => {
							if (err) {
								t6console.log({"message": "Error on writePoints to influxDb", "err": err, "tags": tags, "fields": fields[0], "timestamp": timestamp});
							}
						}).catch(err => {
							t6console.log({"message": "Error catched on writting to influxDb", "err": err, "tags": tags, "fields": fields[0], "timestamp": timestamp});
						});
					}
				}

				if ( publish === true ) {
					let payloadFact = {"dtepoch": time, "value": value, "flow": flow_id}; // This is the minimal payload
					if ( typeof object_id !== "undefined" ) {
						payloadFact.object_id = object_id;
						objects	= db.getCollection("objects");
						let query = {
						"$and": [
								{ "user_id" : req.user.id },
								{ "id" : object_id },
							]
						};
						var object = objects.findOne(query);
						if ( object ) {
							payloadFact.object = object;
						}
					}
					if ( text ) {
						payloadFact.text = text;
					}
					if ( latitude ) {
						payloadFact.latitude = latitude;
					}
					if ( longitude ) {
						payloadFact.longitude = longitude;
					}
					t6decisionrules.action(req.user.id, payloadFact, mqtt_topic);
				}

				fields.flow_id = flow_id;
				fields.id = time*1000000;
				fields[0].flow_id = flow_id;
				fields[0].parent;
				fields[0].first;
				fields[0].prev;
				fields[0].next;
				fields[0].id = time*1000000;
				fields[0].time = time*1000000;
				fields[0].timestamp = time*1000000;
				fields[0].value = value;
				fields[0].datatype = datatype;
				fields[0].publish = publish;
				fields[0].mqtt_topic = mqtt_topic;

				res.header("Location", "/v"+version+"/flows/"+flow_id+"/"+fields[0].id);
				res.status(200).send(new DataSerializer(fields).serialize());
			} else {
				res.status(412).send(new ErrorSerializer({"id": 64.2, "code": 412, "message": "Precondition Failed "+prerequisite,}).serialize());
			}
		}
	} else {
		res.status(412).send(new ErrorSerializer({"id": 65, "code": 412, "message": "Precondition Failed "+error,}).serialize());
	}
});

module.exports = router;