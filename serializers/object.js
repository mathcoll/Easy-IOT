"use strict";
var JSONAPISerializer = require("jsonapi-serializer").Serializer;

function ObjectTypeSerializer(object) {
	this.serialize = function () {
		return new JSONAPISerializer("object", {
			keyForAttribute: "underscore_case",
			attributes: ["name", "user_id", "ui_id", "source_id", "source_version", "fqbn", "otahist", "type", "is_connected", "description", "secret_key", "secret_key_crypt", "position", "ipv4", "ipv6", "isPublic", "longitude", "latitude", "parameters", "communication", "meta"],
			topLevelLinks : {
				parent : sprintf("%s/v%s/objects", baseUrl_https, version),
				self : object.pageSelf!==undefined?sprintf("%s/v%s/objects/?page=%s&size=%s", baseUrl_https, version, object.pageSelf, object.size):undefined,
				first : object.pageFirst!==undefined?sprintf("%s/v%s/objects/?page=%s&size=%s", baseUrl_https, version, object.pageFirst, object.size):undefined,
				prev : object.pagePrev!==undefined?sprintf("%s/v%s/objects/?page=%s&size=%s", baseUrl_https, version, object.pagePrev, object.size):undefined,
				last : object.pageLast!==undefined?sprintf("%s/v%s/objects/?page=%s&size=%s", baseUrl_https, version, object.pageLast, object.size):undefined,
				next : object.pageNext!==undefined?sprintf("%s/v%s/objects/?page=%s&size=%s", baseUrl_https, version, object.pageNext, object.size):undefined,
			},
			dataLinks : {
				self : function(object) {
					return sprintf("%s/v%s/objects/%s", baseUrl_https, version, object.id);
				},
				user : function(object) {
					if ( typeof object.user_id != "undefined" ) {
						return sprintf("%s/v%s/users/%s", baseUrl_https, version, object.user_id);
					} else {
						return undefined;
					}
				},
				source : function(object) {
					if ( typeof object.user_id != "undefined" ) {
						return sprintf("%s/v%s/sources/%s/%s", baseUrl_https, version, object.source_id, object.source_version);
					} else {
						return undefined;
					}
				},
				ui : function(object) {
					if ( typeof object.ui_id != "undefined" ) {
						return sprintf("%s/v%s/uis/%s", baseUrl_https, version, object.ui_id);
					} else {
						return undefined;
					}
				},
				qrcode : {
					low: function(object) {
						return sprintf("%s/v%s/objects/%s/qrcode/8/L", baseUrl_https, version, object.id);
					},
					meddium: function(object) {
						return sprintf("%s/v%s/objects/%s/qrcode/8/M", baseUrl_https, version, object.id);
					},
					quality: function(object) {
						return sprintf("%s/v%s/objects/%s/qrcode/8/Q", baseUrl_https, version, object.id);
					},
					high: function(object) {
						return sprintf("%s/v%s/objects/%s/qrcode/8/H", baseUrl_https, version, object.id);
					}
				}
			},
		}).serialize(object);
	};
}

module.exports = ObjectTypeSerializer;