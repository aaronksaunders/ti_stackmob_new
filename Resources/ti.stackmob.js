 
// Stuff needed to make API play nice with Appcelerator
window = {
  location : {
  	hostname : ""
	}
};
 
// global libraries that are expected to exists
_ = require('underscore');
Backbone = require('backbone');
 
// this is where we just extend the StackMob module to meet the needs of 
// Appcelerator
var TiStackMob = function(options) {
 
	// need to convert this to requires
	Ti.include("stackmob.js");
	var moment = require('moment');
 
	StackMob.Storage = {
 
		// Since the underlying client side storage implementation may not be
		// name-spaced, we'll prefix our saved keys with `STORAGE_PREFIX`.
		STORAGE_PREFIX : 'stackmob.',
 
		//Use this to save things to local storage as a key/value pair.
		persist : function(key, value) {
			// If there's an HTML5 implementation of Local Storage available, then use it.
			// Otherwise, there's no fallback at this point in time.
			Ti.App.Properties.setString(this.STORAGE_PREFIX + key, value);
		},
		//Read a value from local storage given the `key`.
		retrieve : function(key) {
			return Ti.App.Properties.getString(this.STORAGE_PREFIX + key);
		},
		//Remove a value from local storage given the `key`.
		remove : function(key) {
			Ti.App.Properties.removeProperty(this.STORAGE_PREFIX + key);
		}
	};
 
	StackMob['ajax'] = function(model, params, method, options) {
		params['beforeSend'] = function(xhr, settings) {
			xhr.setRequestHeader("Accept", settings['accepts']);
			if (!_.isEmpty(settings['headers'])) {
 
				for (key in settings['headers']) {
					xhr.setRequestHeader(key, settings['headers'][key]);
				}
			}
		};
 
		var error = params['error'];
		params['error'] = function(jqXHR, textStatus, errorThrown) {
			// Workaround for Android broswers not recognizing HTTP status code 206.
			// Call the success method on HTTP Status 0 (the bug) and when a range was specified.
			if (jqXHR.status == 0 && params['query'] && ( typeof params['query']['range'] === 'object')) {
				this.success(jqXHR, textStatus, errorThrown);
				return;
			}
			var responseText = jqXHR.responseText || jqXHR.text;
			StackMob.onerror(jqXHR, responseText, null, model, params, error, options);
		}
		// Set up success callback
		var success = params['success'];
		var defaultSuccess = function(response, status, xhr) {
			var result;
 
			if (params["stackmob_count"] === true) {
				result = xhr;
			} else if (response && response.toJSON) {
				result = response;
			} else if (response && (response.responseText || response.text)) {
				var json = JSON.parse(response.responseText || response.text);
				result = json;
			} else if (response) {
				result = response;
			}
			StackMob.onsuccess(model, method, params, result, success, options);
 
		};
		params['success'] = defaultSuccess;
 
		var xhr = Ti.Network.createHTTPClient({
			onload : function(e) {
				params['success'](xhr);
			},
			onerror : function(e) {
				params['error'](xhr)
			},
			timeout : 5e3
		});
 
		// if logging in...
		if (StackMob.isOAuth2Mode() && (method === 'accessToken' || method === 'facebookAccessToken')) {
			xhr.open(params.type, params.url + "?" + params.data);
			params['beforeSend'](xhr, params);
			return xhr.send();
		} else {
			xhr.open(params.type, params.url);
			params['beforeSend'](xhr, params);
			// if not 'GET' then post body here!!
			return xhr.send(params.type !== 'GET' ? params.data : null);
		}
 
	}; debugger;
	StackMob.init(options);
 
	return StackMob;
};
module.exports = TiStackMob;
