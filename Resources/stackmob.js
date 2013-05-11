/*
 StackMob JS SDK Version 0.9.1
 Copyright 2012-2013 StackMob Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

(function() {
  var root = this;

  /**
   * The StackMob object is the core of the JS SDK.  It holds static variables, methods, and configuration information.
   *
   * It is the only variable introduced globally.
   */

  window.StackMob = root.StackMob = {

    //Default API Version.  Set to 0 for your Development API.  Production APIs are 1, 2, 3+
    DEFAULT_API_VERSION : 0,

    /**
     * StackMob provides an authentication capabilities out of the box.  When you create your StackMob account, a default User schema `user` is created for you.  The primary key field is what's used for login.  The default primary key is `username`, and the default password field is `password`.
     */
    DEFAULT_LOGIN_SCHEMA : 'user',
    DEFAULT_LOGIN_FIELD : 'username',
    DEFAULT_PASSWORD_FIELD : 'password',

    // Radians are defined for use with the geospatial methods.
    EARTH_RADIANS_MI : 3956.6,
    EARTH_RADIANS_KM : 6367.5,

    // Backbone.js will think you're updating an object if you provide an ID.  This flag is used internally in the JS SDK to force a POST rather than a PUT if you provide an object ID.
    FORCE_CREATE_REQUEST : 'stackmob_force_create_request',

    // These constants are used internally in the JS SDK to help with queries involving arrays.
    ARRAY_FIELDNAME : 'stackmob_array_fieldname',
    ARRAY_VALUES : 'stackmob_array_values',

    // This flag is used internally in the JS SDK to help with deletion of objects in relationships.
    CASCADE_DELETE : 'stackmob_cascade_delete',

    // These constants are intended for public use to help with deletion of objects in relationships.
    HARD_DELETE : true,
    SOFT_DELETE : false,

    API_SERVER : 'api.stackmob.com',

    RETRY_WAIT : 10000,
    RETRY_ATTEMPTS : 3,
    REFRESH_TOKEN_KEY : 'oauth2.refreshToken',

    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',

    CONTENT_TYPE_JSON: 'application/json',

    // Use HTTPS for all requests
    SECURE_ALWAYS: "ALWAYS",
    // Use HTTPS for only authentication methods. Deteremind by StackMob.isAccessTokenMethod
    SECURE_MIXED: "MIXED",
    // Never use HTTPS
    SECURE_NEVER: "NEVER",

    // This specifies the server-side API this instance of the JS SDK should point to.  It's set to the Development environment (0) by default.  This should be over-ridden when the user initializes their StackMob instance.
    apiVersion : 0,

    // The current version of the JS SDK.
    sdkVersion : "0.9.1",

    // This holds the application public key when the JS SDK is initialized to connect to StackMob's services via OAuth 2.0.
    publicKey : null,

    /**
     * The Storage object lives within the StackMob object and provides an abstraction layer for client storage.  It's intended for internal use within the JS SDK.  The JS SDK is currently using HTML5's Local Storage feature to persist key/value items.
     */
    Storage : {

      //Since the underlying client side storage implementation may not be name-spaced, we'll prefix our saved keys with `STORAGE_PREFIX`.
      STORAGE_PREFIX : 'stackmob.',

      //Use this to save things to local storage as a key/value pair.
      persist : function(key, value) {
        //If there's an HTML5 implementation of Local Storage available, then use it.  Otherwise, there's no fallback at this point in time.
        if(localStorage)
          localStorage.setItem(this.STORAGE_PREFIX + key, value);
      },
      //Read a value from local storage given the `key`.
      retrieve : function(key) {
        if(localStorage)
          return localStorage.getItem(this.STORAGE_PREFIX + key);
        else
          return null;
      },
      //Remove a value from local storage given the `key`.
      remove : function(key) {
        if(localStorage)
          localStorage.removeItem(this.STORAGE_PREFIX + key);
      }
    },

    /**
     * Helper method to allow altering callback methods
     **/
    _generateCallbacks : function(options, methods){
      options = options || {};

      // Wrap yes/no methods with a success method
      options['success'] = function(result){
        if ( methods['isValidResult'](result) ){
          if (typeof methods['yes'] === "function") methods['yes'](result);
        } else {
          if (typeof methods['no'] === "function") methods['no'](result);
        }
      }

      // Set default error method if one is not provided
      if ( !options['error'] && (typeof methods['error'] === "function") ) {
        options['error'] = methods['error'];
      }

      return options;
    },

    /**
     * Helper method that checks for callback methods in an options object
     **/
    _containsCallbacks : function(options, callbacks){
      return ( typeof options === "object" ) &&
              _.some(callbacks, function(callback){ return typeof options[callback] === "function"; })
    },

    /**
     * Returns the current logged in user's login id: username (or your custom field if specified in StackMob.init), email, or whatever is defined as the primary key.
     * Optionally accepts asynchronous callback methods in the options object.
     */
    getLoggedInUser : function(options) {
      var storedUser = ((!this.isOAuth2Mode() && this.Storage.retrieve(this.loggedInUserKey)) || this.Storage.retrieve('oauth2.user'));
      //The logged in user's ID is saved in local storage until removed, so we need to check to make sure that the user has valid login credentials before returning the login ID.
      if ( options && options['success'] ){
        this.hasValidOAuth(options);
      } else {
        return (this.isLoggedIn(options) && storedUser) ? storedUser : null;
      }
    },

    /**
     * Without specifying the 'options' argument, this is a "dumb" method in that simply checks for the presence of login credentials, not if they're valid.
     * The server checks the validity of the credentials on each API request, however.  It's here for convenience.
     *
     * Optionally accepts asynchronous callback methods in the options object.  When provided, this method will renew the refresh token if required.
     */
    isLoggedIn : function(options) {
      if ( this._containsCallbacks(options, ['yes', 'no']) ){
        options = this._generateCallbacks(options, {
          'isValidResult': function(result) {
            return typeof result !== "undefined";
          },
          'yes': options['yes'],
          'no': options['no'],
          'error': options['no']
        });
        this.hasValidOAuth(options);
      } else {
        return (!this.isLoggedOut()) || this.hasValidOAuth(options);
      }
    },

    /**
     * Without specifying the 'options' argument, this is a "dumb" method in that simply checks if the given `username` is that of the logged in user without asking the server.
     *
     * Optionally accepts asynchronous callback methods in the options object.  When provided, this method will renew the refresh token if required.
     */
    isUserLoggedIn : function(username, options) {
      if ( this._containsCallbacks(options, ['yes', 'no']) ){
        options = this._generateCallbacks(options, {
          'isValidResult': function(result) {
            return result == username;
          },
          'yes': options['yes'],
          'no': options['no'],
          'error': options['no']
        });
        this.hasValidOAuth(options);
      } else {
        return username == this.getLoggedInUser(options);
      }
    },

    /**
     * Without specifying the 'options' argument, this is a "dumb" method in that checks to see if a user is logged out (doesn't have login credentials) without hitting the server.
     *
     * Optionally accepts asynchronous callback methods in the options object.  When provided, this method will renew the refresh token if required.
     */
    isLoggedOut : function(options) {
      if ( this._containsCallbacks(options, ['yes', 'no']) ){
        options = this._generateCallbacks(options, {
          'isValidResult': function(result) {
            return typeof result == "undefined";
          },
          'yes': options['yes'],
          'no': options['no'],
          'error': options['yes']
        });
        this.hasValidOAuth(options);
      } else {
        return !this.hasValidOAuth(options);
      }
    },

    //This is an internally used method to get the API URL no matter what the context - development, production, etc.  This envelopes `getDevAPIBase` and `getProdAPIBase` in that this method is smart enough to choose which of the URLs to use.
    getBaseURL : function() {
      if( StackMob['useRelativePathForAjax'] ){
        // Build "relative path" (also used for OAuth signing)
        return StackMob.apiDomain ? StackMob.apiDomain : (window.location.hostname + (window.location.port ? ':' + window.location.port : '')) + '/';
      } else {
        // Use absolute path and operate through CORS
        return StackMob.apiDomain ? StackMob.apiDomain : (StackMob['API_SERVER'] + '/');
      }
    },
    //The JS SDK calls this to throw an error.
    throwError : function(msg) {
      throw new Error(msg);
    },
    //The JS SDK calls this specifically when there's a URL error.
    urlError : function() {
      this.throwError('A "url" property or function must be specified');
    },
    //Some methods are OAuth 2.0 only.  This is used internally in the JS SDK to throw an error if a public key is required in initialization.
    requirePublicKey : function() {
      if(!StackMob.publicKey)
        this.throwError("Error: This requires that you initialize StackMob with a public key.");
    },
    //Checks to see if the JS SDK is in OAuth 2.0 mode or not.
    isOAuth2Mode : function() {
      return !isNaN(StackMob['publicKey'] && !StackMob['privateKey']);
    },
    prepareCredsForSaving : function(accessToken, refreshToken, macKey, expires, user, schemaInfo) {
      var expireTime = (new Date()).getTime() + (this._stubbedExpireTime(expires) * 1000);
      //For convenience, the JS SDK will save the expiration date of these credentials locally so that the developer can check for it if need be.
      var creds = {
        'oauth2.accessToken' : accessToken,
        'oauth2.macKey' : macKey,
        'oauth2.expires' : expireTime,
        'oauth2.user' : user,
        'oauth2.userSchemaInfo' : schemaInfo
      };
      creds[StackMob.REFRESH_TOKEN_KEY] = refreshToken;

      return creds;
    },

    //Why have this?  So that we can overwrite the expire time via _.extend(StackMob, { _stubbedExpireTime: ... }) for tests
    _stubbedExpireTime: function(expires) {
      return expires;
    },

    //Saves the OAuth 2.0 credentials (passed in as JSON) to client storage.
    saveOAuthCredentials : function(creds) {
      var accessToken = creds['oauth2.accessToken'];
      var refreshToken = creds[StackMob.REFRESH_TOKEN_KEY];

      //Because the server sends back how long the credentials are valid for and not the expiration date, we construct the expiration date on the client side.  For the login scenario where we are using OAuth 2.0's redirect URL mechanism and where a user refreshes the logged-in redirected URL page, we don't want to incorrectly generate and save a new expiration date.  If the access token is the same, then leave the expiration date as is.
      //FIXME:  don't even pass in the expires value if we dont' intend to save it.  Move this logic out to handleOAuthCallback.  This check is happening too late down the line.
      if(this.Storage.retrieve('oauth2.accessToken') != accessToken) {
        this.Storage.persist('oauth2.expires', creds['oauth2.expires']);
      }

      this.Storage.persist('oauth2.accessToken', accessToken);
      this.Storage.persist(StackMob.REFRESH_TOKEN_KEY, refreshToken);
      this.Storage.persist('oauth2.macKey', creds['oauth2.macKey']);
      this.Storage.persist('oauth2.user', creds['oauth2.user']);
      this.Storage.persist('oauth2.userSchemaInfo', JSON.stringify(creds['oauth2.userSchemaInfo']));
    },
    //StackMob validates OAuth 2.0 credentials upon each request and will send back a error message if the credentials have expired.  To save the trip, developers can check to see if their user has valid OAuth 2.0 credentials that indicate the user is logged in.
    hasValidOAuth : function(options) {
      options = options || {};

      //If we aren't running in OAuth 2.0 mode, then kick out early.
      if(!this.isOAuth2Mode()){
        if (options && options['error'])
          options['error']();
        return false;
      }

      //Check to see if we have all the necessary OAuth 2.0 credentials locally AND if the credentials have expired.
      var creds = this.getOAuthCredentials();
      var expires =  (creds && creds['oauth2.expires']) || 0;

      //If no accesstoken, mackey, or expires..
      if ( !_.all([creds['oauth2.accessToken'], creds['oauth2.macKey'], expires], _.identity) ){
        if (options && options['success']) options['success'](undefined);
        return false;
      }

      if ( !StackMob.hasExpiredOAuth() ) {
        //If not expired
        if (options && options['success'] ){
          options['success']( this.Storage.retrieve('oauth2.user') );
        }
        return this.Storage.retrieve('oauth2.user');
      } else if ( options && options['success']) {
        //If expired and async
        var originalSuccess = options['success'];
        options['success'] = function(input){
          var creds = StackMob.getOAuthCredentials();

          var loginField =  (creds['oauth2.userSchemaInfo'] && creds['oauth2.userSchemaInfo']['loginField']) ? 
            creds['oauth2.userSchemaInfo']['loginField'] : this['loginField'];
          originalSuccess( input[loginField]);
        }
        this.initiateRefreshSessionCall(options)
      } else {
        //If expired and sync
        return false;
      }

    },
    initiateRefreshSessionCall: function(options) {
      StackMob.refreshSession.call(StackMob, options);
    },
    shouldSendRefreshToken : function() {
      return this.hasExpiredOAuth() && this.hasRefreshToken() && this.shouldKeepLoggedIn();
    },
    keepLoggedIn : function(keep) {
      StackMob.Storage.persist('oauth2.shouldKeepLoggedIn', keep === true);
    },
    shouldKeepLoggedIn : function() {
      return StackMob.Storage.retrieve('oauth2.shouldKeepLoggedIn') === 'true';
    },
    hasRefreshToken : function() {
      var creds = this.getOAuthCredentials();
      return creds && ( typeof creds[StackMob.REFRESH_TOKEN_KEY] !== 'undefined') && creds[StackMob.REFRESH_TOKEN_KEY] != null;
    },
    getRefreshToken : function() {
      var creds = this.getOAuthCredentials();
      return creds[StackMob.REFRESH_TOKEN_KEY];
    },
    hasExpiredOAuth : function() {
      return this.isOAuth2Mode() && (this.getOAuthExpireTime() == null) || (this.getOAuthExpireTime() <= (new Date()).getTime())
    },

    clearOAuthCredentials : function() {
      StackMob.Storage.remove(StackMob.loggedInUserKey);
      StackMob.Storage.remove('oauth2.accessToken');
      StackMob.Storage.remove(StackMob.REFRESH_TOKEN_KEY);
      StackMob.Storage.remove('oauth2.macKey');
      StackMob.Storage.remove('oauth2.expires');
      StackMob.Storage.remove('oauth2.user');
      StackMob.Storage.remove('oauth2.userSchemaInfo');
    },

    //Retrieve the OAuth 2.0 credentials from client storage.
    getOAuthCredentials : function() {
      var oauth_accessToken = StackMob.Storage.retrieve('oauth2.accessToken');
      var oauth_macKey = StackMob.Storage.retrieve('oauth2.macKey');
      var oauth_expires = StackMob.Storage.retrieve('oauth2.expires');
      var oauth_refreshToken = StackMob.Storage.retrieve(StackMob.REFRESH_TOKEN_KEY);
      var userSchemaInfo = StackMob.Storage.retrieve('oauth2.userSchemaInfo');
      var oauth_schema = null;

      try {
        oauth_schema = JSON.parse(userSchemaInfo);
      } catch (e) { /* Harmless if this fails (in theory!)*/ }

      if (_.every([oauth_accessToken, oauth_macKey, oauth_expires, oauth_refreshToken, oauth_schema])) {
        var creds = {
          'oauth2.accessToken' : oauth_accessToken,
          'oauth2.macKey' : oauth_macKey,
          'oauth2.expires' : oauth_expires,
          'oauth2.userSchemaInfo' : oauth_schema
        };
        creds[StackMob.REFRESH_TOKEN_KEY] = oauth_refreshToken;

        return creds;
      } else {
        return {};
      }

    },
    //Returns the date (in milliseconds) for when the current user's OAuth 2.0 credentials expire.
    getOAuthExpireTime : function() {
      var expires = this.Storage.retrieve('oauth2.expires');
      return expires ? parseInt(expires) : null;
    },
    //This is an internally used map that works with Backbone.js.  It maps methods to HTTP Verbs used when making ajax calls.
    METHOD_MAP : {
      "create"                          : "POST",
      "read"                            : "GET",
      "update"                          : "PUT",
      "delete"                          : "DELETE",

      "post"                            : "POST",
      "get"                             : "GET",
      "put"                             : "PUT",

      "addRelationship"                 : "POST",
      "appendAndSave"                   : "PUT",
      "deleteAndSave"                   : "DELETE",

      "login"                           : "GET",
      "accessToken"                     : "POST",
      "refreshToken"                    : "POST",
      "logout"                          : "GET",
      "forgotPassword"                  : "POST",
      "loginWithTempAndSetNewPassword"  : "GET",
      "resetPassword"                   : "POST",

      "facebookAccessToken"             : "POST",
      "facebookAccessTokenWithCreate"   : "POST",
      "createUserWithFacebook"          : "POST",
      "linkUserWithFacebook"            : "GET",
      "unlinkUserFromFacebook"          : "DELETE",

      "gigyaAccessToken"                : "POST",
      "linkUserWithGigya"               : "POST",
      "unlinkUserFromGigya"             : "DELETE"
    },

    /**
     * Convenience method to retrieve the value of a key in an object.  If it's a function, give its return value.
     */
    getProperty : function(object, prop) {

      if(!(object && object[prop]))
        return null;

      return _.isFunction(object[prop]) ? object[prop]() : object[prop];
    },
    /**
     * Externally called by user to initialize their StackMob config.
     */
    init : function(options) {

      options = options || {};

      // Run stuff before StackMob is initialized.
      this.initStart(options);

      /* DEPRECATED METHODS BELOW */
      this.userSchema = options['userSchema'];        // DEPRECATED: Use StackMob.User.extend({ schemaName: 'customschemaname' });
      this.loginField = options['loginField'];        // DEPRECATED: Use StackMob.User.extend({ loginField: 'customloginfield' });
      this.passwordField = options['passwordField'];  // DEPRECATED: Use StackMob.User.extend({ passwordField: 'custompasswordfield' });
      /* DEPRECATED METHODS ABOVE */

      this.newPasswordField = 'new_password';

      this.publicKey = options['publicKey'];

      this.apiVersion = options['apiVersion'] || this.DEFAULT_API_VERSION;

      /*
       * apiURL (DEPRECATED) - Advaanced Users Only.  Use apiDomain instead.
       * Used to redirect SDK requests to a different URL.
       *
       */
      if (typeof options['apiURL'] !== "undefined")
        throw new Error("Error: apiURL is no longer supported.  The API URL is now automatically set for PhoneGap users.");

      /*
       * apiDomain - Advanced Users Only. Only set apiDomain to redirect SDK
       * requests to a different domain.
       *
       * Init variable 'apiDomain' should not contain a URL scheme (http:// or https://).
       * Scheme will be prepended according to 'secure' init setting.
       */
      var apiDomain = options['apiDomain'];
      if (typeof apiDomain === "string"){
        if (apiDomain.indexOf('http') == 0){
          throw new Error("Error: apiDomain should not specify url scheme (http/https). For example, specify api.stackmob.com instead of http://api.stackmob.com. URL Scheme is determined by the 'secure' init variable.")
        } else {
          if (apiDomain.indexOf('/') == apiDomain.length - 1){
            this.apiDomain = apiDomain;
          } else {
            this.apiDomain = apiDomain + '/';
          }
        }
      }

      /*
       * useRelativePathForAjax - Advanced Users Only. Use to redirect SDK requests to a
       * path relative to the current URL.  Will only work for StackMob Hosts that can
       * properly proxy requests to api.stackmob.com
       *
       * HTML5 apps hosted on stackmobapp.com will be set to `true` and use a relative path
       * automatically.
       */
      var isSMHosted = (window.location.hostname.indexOf('.stackmobapp.com') > 0);
      this.useRelativePathForAjax = (typeof options['useRelativePathForAjax'] === "boolean") ? options['useRelativePathForAjax'] : isSMHosted;

      /*
       * secure - Determine which requests should be done over SSL.
       * Default the security mode to match the current URL scheme.
       *
       * If current page is HTTPS, set to SECURE_ALWAYS.
       * If current page is HTTP, set to SECURE_NEVER.
       * Otherwise, set to SECURE_MIXED.
       * Can be overridden by manually specifying a security mode in init().
       */
      if (options['secure']) {
        this.secure = options['secure'];
      } else if (window.location.protocol.indexOf("https:") == 0) {
        this.secure = this.SECURE_ALWAYS;
      } else if (window.location.protocol.indexOf("http:") == 0) {
        this.secure = this.SECURE_NEVER;
      } else {
        this.secure = this.SECURE_MIXED;
      }

      this.ajax = options['ajax'] || this.ajax;

      this.initEnd(options);

      return this;
    },
    initStart : function(options) {
      // Any actions a developer may want to implement via _extend should be done here
    },
    initEnd : function(options) {
    },

    /*
     * Need to modify the options callbacks at all?  do that here.
     * These are placed in methods where Backbone wraps the success/error calls so that
     * we also have an opportunity to modify/wrap the options if necessary.
     */
    wrapStackMobCallbacks: function(options, callInfo) {}
  };

}).call(this);

/**
 * StackMob JS SDK
 * BackBone.js-based
 * Backbone.js Version 0.9.2
 * No OAuth - for use with StackMob's HTML5 Product
 */
(function() {
  var root = this;

  var $ = root.jQuery || root.Ext || root.Zepto;

  function createBaseString(ts, nonce, method, uri, host, port) {
    var nl = '\u000A';
    return ts + nl + nonce + nl + method + nl + uri + nl + host + nl + port + nl + nl;
  }

  function generateMAC(method, id, key, hostWithPort, url, host) {
    var splitHost = hostWithPort.split(':');
    var hostNoPort = splitHost.length > 1 ? splitHost[0] : hostWithPort;
    var port = splitHost.length > 1 ? splitHost[1] : ((host.substring(0,5) == 'https') ? 443 : 80);

    var ts = Math.round(new Date().getTime() / 1000);
    var nonce = "n" + Math.round(Math.random() * 10000);

    var base = createBaseString(ts, nonce, method, url, hostNoPort, port);

    var hash = CryptoJS.HmacSHA1(base, key);
    var mac = hash.toString(CryptoJS.enc.Base64);

    return 'MAC id="' + id + '",ts="' + ts + '",nonce="' + nonce + '",mac="' + mac + '"';
  }

  function getAuthHeader(params){
    var scheme = params['url'].match(/(^http|^https):\/\//g);
    var host = scheme + StackMob.getBaseURL();

    var path = params['url'].replace(new RegExp(host, 'g'), '/');

    // Remove trailing slash from host for signing
    var sighost = host.replace(new RegExp('^http://|^https://', 'g'), '').replace(new RegExp('/'), '');

    var accessToken = StackMob.Storage.retrieve('oauth2.accessToken');
    var macKey = StackMob.Storage.retrieve('oauth2.macKey');
    var expires = StackMob.Storage.retrieve('oauth2.expires');

    if(StackMob.isOAuth2Mode() && accessToken && macKey) {
      var authHeader = generateMAC(params['type'], accessToken, macKey, sighost, path, host);
      return authHeader;
    }
  }

  function _getURLScheme(method, params){
    params = params || {};
    var scheme,
        HTTP  = 'http',
        HTTPS = 'https';

    if ( params['secureRequest'] === true ) {
      scheme = HTTPS;
    } else {
      switch(StackMob.secure){
        case StackMob.SECURE_ALWAYS:
          scheme = HTTPS;
          break;
        case StackMob.SECURE_NEVER:
          scheme = HTTP;
          break;
        case StackMob.SECURE_MIXED:
        default:
          scheme = StackMob._isSecureMethod(method, params) ? HTTPS : HTTP;
          break;
      }
    }

    return scheme + '://';
  }

  function _prepareHeaders(method, params, options) {
    options = options || {};

    //Prepare Request Headers
    params['headers'] = params['headers'] || {};

    //Add API Version Number to Request Headers

    //let users overwrite this if they know what they're doing
    params['headers'] = _.extend({
      "Accept" : 'application/vnd.stackmob+json; version=' + StackMob['apiVersion']
    }, params['headers']);

    //dont' let users overwrite the stackmob headers though..
    _.extend(params['headers'], {
      "X-StackMob-User-Agent" : "StackMob (JS; " + StackMob['sdkVersion'] + ")"
    });

    if(StackMob['publicKey'] && !StackMob['privateKey']) {
      params['headers']['X-StackMob-API-Key'] = StackMob['publicKey'];
      params['headers']['X-StackMob-Proxy-Plain'] = 'stackmob-api';
      // CORS Support
      // The value is set to something arbitrary because IE strips out
      // headers with empty values.
      params['headers']['X-StackMob-API-Key-' + StackMob['publicKey']] = "1";
    } else {
      params['headers']['X-StackMob-Proxy'] = 'stackmob-api';
    }

    //let users overwrite this if they know what they're doing
    if(StackMob.isOAuth2Mode() && StackMob.isAccessTokenMethod(method)) {
      params['contentType'] = 'application/x-www-form-urlencoded';
    } else if(_.include(['PUT', 'POST'], StackMob.METHOD_MAP[method])) {
      params['contentType'] = params['contentType'] || StackMob.CONTENT_TYPE_JSON;
    }

    if(!isNaN(options[StackMob.CASCADE_DELETE])) {
      params['headers']['X-StackMob-CascadeDelete'] = options[StackMob.CASCADE_DELETE] == true;
    }

    // If this is an advanced query, check headers
    if(options['query']) {
      var queryObj = params['query'] || throwError("No StackMobQuery object provided to the query call.");

      if(queryObj['selectFields']) {
        if(queryObj['selectFields'].length > 0) {
          params['headers']["X-StackMob-Select"] = queryObj['selectFields'].join();
        }
      }

      //Add Range Headers
      if(queryObj['range']) {
        params['headers']['Range'] = 'objects=' + queryObj['range']['start'] + '-' + queryObj['range']['end'];
      }

      //Add Query Parameters to Parameter Map
      _.extend(params['data'], queryObj['params']);

      //Add OrderBy Headers
      if(queryObj['orderBy'] && queryObj['orderBy'].length > 0) {
        var orderList = queryObj['orderBy'];
        var order = '';
        var size = orderList.length;
        for(var i = 0; i < size; i++) {
          order += orderList[i];
          if(i + 1 < size)
            order += ',';
        }
        params['headers']["X-StackMob-OrderBy"] = order;
      }
    }
  }

  function _prepareAjaxClientParams(params) {
    params = params || {};
    //Prepare 3rd party ajax settings
    params['processData'] = false;
    //Put Accept into the header for jQuery
    params['accepts'] = params['headers']["Accept"];
  }

  function _prepareAuth(method, params) {
    if(StackMob.isAccessTokenMethod(method)) {
      return;
      //then don't add an Authorization Header
    }

    var authHeader = getAuthHeader(params);
    if(authHeader) {
      params['headers']['Authorization'] = authHeader;
    }

  }

  _.extend(StackMob, {

    isSencha : function() {
      return root.Ext;
    },
    isZepto : function() {
      return root.Zepto;
    },
    initEnd : function(options) {
      createStackMobModel();
      createStackMobCollection();
      createStackMobUserModel();
    },

    cc : function(method, params, verb, options) {
      this.customcode(method, params, verb, options);
    },

    customcode : function(method, params, verb, options) {
      function isValidVerb(v) {
        return v && !_.isUndefined(StackMob.METHOD_MAP[verb.toLowerCase()]);
      }

      if(_.isObject(verb)) {
        options = verb || {};
        var verb = options['httpVerb'];
        verb = isValidVerb(verb) ? verb : 'GET'
        options['httpVerb'] = verb;
      } else {
        options = options || {};
        if(_.isString(verb) && isValidVerb(verb))
          options['httpVerb'] = verb.toUpperCase();
      }
      options['data'] = options['data'] || {};
      if (verb !== 'GET') options['contentType'] = options['contentType'] || StackMob.CONTENT_TYPE_JSON;
      _.extend(options['data'], params);
      options['url'] = _getURLScheme(method, params) + this.getBaseURL();
      this.sync.call(StackMob, method, null, options);
    },

    processLogin : function(result, options) {
      if(StackMob.isOAuth2Mode()) {
        var oauth2Creds = result;

        var accessToken = oauth2Creds['access_token'];
        var refreshToken = oauth2Creds['refresh_token'];
        var macKey = oauth2Creds['mac_key'];
        var expires = oauth2Creds['expires_in'];

        try {
          var savedCreds = StackMob.getOAuthCredentials();

          /*
           * processLogin can be called by the developer or automatically by refreshSession
           * if by refreshSession, there is no user schema info passed from the options, so fetch it from the local storage if that's the case.'
           */
          var userSchemaInfo = options['stackmob_userschemainfo'] || savedCreds['oauth2.userSchemaInfo']; //get schema info

          var loginField = userSchemaInfo['loginField']; //so that we can determine the primary key/login field
          var username = result['stackmob']['user'][loginField]; //figure out username

          var creds = StackMob.prepareCredsForSaving(accessToken, refreshToken, macKey, expires, username, userSchemaInfo);
          //...then let's save the OAuth credentials to local storage.
          StackMob.saveOAuthCredentials(creds);
          StackMob.Storage.persist(StackMob.loggedInUserKey, username);
        } catch(err) {
          if(console)
            console.error('Problem saving OAuth 2.0 credentials and user: ' + err);
        }
      }
    },
    sync : function(method, model, options) {
      options = options || {};

      if(!StackMob.isAccessTokenMethod(method) && StackMob.shouldSendRefreshToken() && options['stackmob_attempted_refresh'] !== true) {

        var originalMethod = method;
        var originalOptions = options;

        originalOptions['stackmob_attempted_refresh'] = true;

        var originalModel = model;
        var originalThis = this;

        StackMob.refreshSession.call(StackMob, {
          oncomplete : function() { // oncomplete because we don't care whether success or error
            StackMob.sync.call(originalThis, originalMethod, originalModel, originalOptions);
          }
        });

        return false;
      }

      //Override to allow 'Model#save' to force create even if the id (primary key) is set in the model and hence !isNew() in BackBone
      var forceCreateRequest = options[StackMob.FORCE_CREATE_REQUEST] === true
      if(forceCreateRequest) {
        method = 'create';
      }

      function _prepareBaseURL(model, method, params) {
        params = params || {};

        var scheme = _getURLScheme(method, params);

        //User didn't override the URL so use the one defined in the model
        if(!params['url'] && model) {
          params['url'] = scheme + model.url();
        }

        var notCustomCode = method != 'cc';
        var notNewModel = (model && model.isNew && !model.isNew());
        var notForcedCreateRequest = !forceCreateRequest;
        var isArrayMethod = (method == 'addRelationship' || method == 'appendAndSave' || method == 'deleteAndSave');

        if(_isExtraMethodVerb(method)) { // Extra Method Verb? Add it to the model url. (e.g. /user/login)
          var endpoint = method;

          params['url'] += (params['url'].charAt(params['url'].length - 1) == '/' ? '' : '/') + endpoint;
        } else if(isArrayMethod || notCustomCode && notNewModel && notForcedCreateRequest) {//append ID in URL if necessary
          params['url'] += (params['url'].charAt(params['url'].length - 1) == '/' ? '' : '/') + encodeURIComponent(model.get(model.getPrimaryKeyField()));

          if(isArrayMethod) {
            params['url'] += '/' + options[StackMob.ARRAY_FIELDNAME];
          }

          if(method == 'deleteAndSave') {
            var ids = '';

            if(_.isArray(options[StackMob.ARRAY_VALUES])) {
              ids = _.map(options[StackMob.ARRAY_VALUES], function(id) {
                return encodeURIComponent(id);
              }).join(',');
            } else {
              ids = encodeURIComponent(options[StackMob.ARRAY_VALUES]);
            }

            params['url'] += '/' + ids;
          }
        }

      }

      function _prepareRequestBody(method, params, options) {
        options = options || {};

        function toParams(obj) {
          var params = _.map(_.keys(obj), function(key) {
            return key + '=' + encodeURIComponent(obj[key]);
          });
          return params.join('&');
        }

        //Set the request body
        if(StackMob.isOAuth2Mode() && StackMob.isAccessTokenMethod(method)) {
          params['data'] = toParams(params['data']);
        } else if(params['type'] == 'POST' || params['type'] == 'PUT') {
          if(method == 'resetPassword' || method == 'forgotPassword') {
            params['data'] = JSON.stringify(params['data']);
          } else if(method == 'addRelationship' || method == 'appendAndSave') {
            if(options && options[StackMob.ARRAY_VALUES])
              params['data'] = JSON.stringify(options[StackMob.ARRAY_VALUES]);
          } else if(model) {
            var json = model.toJSON();

            //Let developers ignore fields
            var ignorefields = options['remote_ignore'] || [];
            _.each(ignorefields, function(fieldname) {
              delete json[fieldname];
            });
            delete json['lastmoddate'];
            delete json['createddate'];

            if(method == 'update') {
              var userSchemaInfo = options['stackmob_userschemainfo'] || StackMob.getOAuthCredentials()['oauth2.userSchemaInfo'];

              if (userSchemaInfo) {
                var passwordField = userSchemaInfo['passwordField'];
                delete json[passwordField];
              }

              _.each(model.getBinaryFields(), function(field) {
                if (json[field] && json[field].indexOf('http') == 0) {
                  delete json[field];
                }
              });
            }

            if(StackMob.isOAuth2Mode())
              delete json['sm_owner'];
            params['data'] = JSON.stringify(_.extend(json, params['data']));
          } else
            params['data'] = JSON.stringify(params.data);
        } else if(params['type'] == "GET" || params['type'] == "DELETE") {
          if(!_.isEmpty(params['data'])) {
            params['url'] += '?';
            var path = toParams(params['data']);
            params['url'] += path;
          }
          delete params['data'];
          //we shouldn't be passing anything up as data in a GET call
        } else {
          delete params['data'];
        }
      }

      function _isExtraMethodVerb(method) {
        return !_.include(['create', 'update', 'delete', 'read', 'query', 'deleteAndSave', 'appendAndSave', 'addRelationship'], method);
      }

      //Determine what kind of call to make: GET, POST, PUT, DELETE
      var type = options['httpVerb'] || StackMob.METHOD_MAP[method] || 'GET';

      //Prepare query configuration
      var params = _.extend({
        type : type,
        dataType : 'json'
      }, options);

      params['data'] = params['data'] || {};

      _prepareBaseURL(model, method, params);
      _prepareHeaders(method, params, options);
      _prepareRequestBody(method, params, options);
      _prepareAjaxClientParams(params);
      _prepareAuth(method, params);

      StackMob.makeAPICall(model, params, method, options);
    },
    refreshSession : function(options) {

      //Make an ajax call here hitting the refreshToken access point and oncomplete, run whatever was passed in
      var refreshOptions = {};

      _.extend(refreshOptions, options);

      if(StackMob.hasRefreshToken()) {
        var userSchema = StackMob.getOAuthCredentials()['oauth2.userSchemaInfo'] ? StackMob.getOAuthCredentials()['oauth2.userSchemaInfo']['schemaName'] : StackMob['userSchema'];

        //set request call details
        refreshOptions['url'] = _getURLScheme('refreshToken') + this.getBaseURL() + userSchema;
        refreshOptions['contentType'] = 'application/x-www-form-urlencoded';
        refreshOptions['data'] = {
          refresh_token : StackMob.getOAuthCredentials()[StackMob.REFRESH_TOKEN_KEY],
          grant_type : 'refresh_token',
          token_type : 'mac',
          mac_algorithm : 'hmac-sha1'
        };

        //Set oncomplete callback
        var originalOncomplete = options['oncomplete'];
        if ( originalOncomplete ) {
          refreshOptions['oncomplete'] = function() {
            originalOncomplete();
          };
        }

        if ( options && options['success'] ){
          refreshOptions['success'] = options['success'];
        }

        refreshOptions['stackmob_onrefreshToken'] = StackMob.processLogin;
        //Set onerror callback
        refreshOptions['error'] = function() {
          if ( options && options['error'] )
            options['error']();
          //invalidate the refresh token
          StackMob.Storage.remove(StackMob.REFRESH_TOKEN_KEY);
        };

        (this.sync || Backbone.sync).call(this, 'refreshToken', this, refreshOptions);
      } else {
        if (options && options['error']) {
          options['error']();
        }
      }
    },
    makeAPICall : function(model, params, method, options) {
      if(StackMob['ajax']) {
        return StackMob['ajax'](model, params, method, options);
      } else if(StackMob.isSencha()) {
        return StackMob['ajaxOptions']['sencha'](model, params, method, options);
      } else if(StackMob.isZepto()) {
        return StackMob['ajaxOptions']['zepto'](model, params, method, options);
      } else {
        return StackMob['ajaxOptions']['jquery'](model, params, method, options);
      }
    },
    onsuccess : function(model, method, params, result, success, options) {
      /**
       * If there's an internal success callback function, execute it.
       */
      if(params) {
        if(_.isFunction(params['stackmob_on' + method]))
          params['stackmob_on' + method](result, options);
        if(_.isFunction(params['oncomplete']))
          params['oncomplete'](result);
      }

      if(success) {
        if(result) {
          /**
           * In OAuth 2.0 mode, a successful login response will have the OAuth 2.0 credentials as well as the full user object in the response.
           * But the user's success callback is only expecting the user, so let's deal with that here.
           */
          if(StackMob.isOAuth2Mode() && StackMob.isAccessTokenMethod(method) && result['stackmob']) {

            //If we have "stackmob" in the response, that means we're getting stackmob data back.
            //pass the user back to the user's success callback
            result = result['stackmob']['user'];

            //When we login, we get the full user object back.  We give the developer the option to either populate the user schema with it or not.
            //If not, then we only populate the username (useful if they log with nothing but a facebook token etc.)  We need the username to test
            //user.isLoggedIn()
            //If we do fully populate, then populate the whole object
            var fullyPopulateUser = options['fullyPopulateUser'] === true;

            if (model && model.parse) {
              if (!fullyPopulateUser) {
                var toAdd = {};
                toAdd[model.getPrimaryKeyField()] = result[model.getPrimaryKeyField()];
                if (!model.set(toAdd, options)) return false;
              } else {
                if (!model.set(model.parse(result, options), options)) return false;
              }
            }

            success(result);

            //trigger a change in the user if we've fully populated the user
            if (fullyPopulateUser && model && model.trigger) model.trigger('sync', model, result, options);
          } else {
            success(result);
          }

        } else {
          success();
        }
      }
    },
    onerror : function(response, responseText, ajaxFunc, model, params, err, options) {
      var statusCode = response.status;
      var result;
      try {
        result = JSON.parse(responseText);
      } catch (err) {
        result = {
          error : 'Invalid JSON returned.'
        };
      }

      if(statusCode == 503) {
        var wait = response.getResponseHeader('retry-after');
        try {
          wait = parseInt(responseHeaderValue) * 1000;
        } catch(e) {
          wait = StackMob.RETRY_WAIT;
        }

        // If this is the first retry, set remaining attempts
        // Otherwise decrement the retry counter
        if(typeof params['stackmob_retry'] === 'number') {
          params['stackmob_retry'] -= 1;
          if(params['stackmob_retry'] <= 0){ return; }
        } else {
          params['stackmob_retry'] = StackMob.RETRY_ATTEMPTS ;
        }

        // Set delay for the next retry attempt
        _.delay(function() {
          var authHeader = getAuthHeader(params);
          params['headers']['Authorization'] = authHeader;
          if (ajaxFunc) ajaxFunc(params);
        }, wait);
      } else {
        if(_.isFunction(params['oncomplete']))
          params['oncomplete'](result);
        if(err)
          err(result)
      }
    },
    isAccessTokenMethod : function(method) {
      var accessTokenMethods = ['accessToken',
                        'refreshToken',
                        'facebookAccessToken',
                        'facebookAccessTokenWithCreate',
                        'gigyaAccessToken'];
      return _.include(accessTokenMethods, method);
    },
    _isSecureMethod : function(method, params){
      var secureMethods = ['loginWithTempAndSetNewPassword',
                            'createUserWithFacebook',
                            'linkUserWithFacebook',
                            'unlinkUserFromFacebook',
                            'linkUserWithGigya',
                            'unlinkUserFromGigya'];
      if (StackMob.isAccessTokenMethod(method)) {
        return true;
      } else if (params['isUserCreate'] == true) {
        return true;
      } else {
        return _.include(secureMethods, method);
      }
    }
  });
  //end of StackMob

  var createStackMobModel = function() {

    /**
     * Abstract Class representing a StackMob Model
     */
    StackMob.Model = Backbone.Model.extend({
      urlRoot : StackMob.getBaseURL(),

      getBinaryFields: function() {
        return this.binaryFields || [];
      },

      url : function() {
        var base = StackMob.getBaseURL();
        base += this.schemaName;
        return base;
      },
      getPrimaryKeyField : function() {
        return this.schemaName + '_id';
      },
      constructor : function() {
        this.setIDAttribute();
        //have to do this because I want to set this.id before this.set is called in default constructor
        Backbone.Model.prototype.constructor.apply(this, arguments);
      },
      initialize : function(attributes, options) {
        StackMob.getProperty(this, 'schemaName') || StackMob.throwError('A schemaName must be defined');
        this.setIDAttribute();
      },
      setIDAttribute : function() {
        this.idAttribute = this.getPrimaryKeyField();
      },
      parse : function(data, xhr) {
        if(!data || (data && (!data['text'] || data['text'] == '')))
          return data;

        var attrs = JSON.parse(data['text']);

        return attrs;
      },
      sync : function(method, model, options) {
        StackMob.sync.call(this, method, this, options);
      },
      create : function(options) {
        var newOptions = {};
        newOptions[StackMob.FORCE_CREATE_REQUEST] = true;
        _.extend(newOptions, options);
        this.save(null, newOptions);
      },
      query : function(stackMobQuery, options) {
        options = options || {};
        _.extend(options, {
          query : stackMobQuery
        })
        this.fetch(options);
      },
      fetch : function(options) {
        StackMob.wrapStackMobCallbacks.call(this, options);
        Backbone.Model.prototype.fetch.call(this, options);
      },
      destroy: function(options) {
        StackMob.wrapStackMobCallbacks.call(this, options);
        Backbone.Model.prototype.destroy.call(this, options);
      },
      save : function(key, value) {
        var successFunc = key ? key['success'] : {};
        var errorFunc = key ? key['error'] : {};
        if( typeof value === 'undefined' && (_.isFunction(successFunc) || _.isFunction(errorFunc))) {
          StackMob.wrapStackMobCallbacks.call(this, key);
          Backbone.Model.prototype.save.call(this, null, key);
        } else {
          StackMob.wrapStackMobCallbacks.call(this, value);
          Backbone.Model.prototype.save.call(this, key, value);
        }
      },
      fetchExpanded : function(depth, options) {
        if(depth < 0 || depth > 3)
          StackMob.throwError('Depth must be between 0 and 3 inclusive.');
        var newOptions = {};
        _.extend(newOptions, options);
        newOptions['data'] = newOptions['data'] || {};
        newOptions['data']['_expand'] = depth;

        this.fetch(newOptions);
      },
      getAsModel : function(fieldName, model) {
        var obj = this.get(fieldName);
        if(!obj)
          return {};
        else {
          if(_.isArray(obj)) {
            return _.map(obj, function(o) {
              return new model(o);
            });
          } else {
            return new model(obj);
          }
        }
      },
      appendAndCreate : function(fieldName, values, options) {
        this.addRelationship(fieldName, values, options);
      },
      addRelationship : function(fieldName, values, options) {
        options = options || {};
        options[StackMob.ARRAY_FIELDNAME] = fieldName;
        options[StackMob.ARRAY_VALUES] = values;

        StackMob.sync.call(this, 'addRelationship', this, options);
      },
      appendAndSave : function(fieldName, values, options) {
        options = options || {};
        options[StackMob.ARRAY_FIELDNAME] = fieldName;
        options[StackMob.ARRAY_VALUES] = values;
        StackMob.sync.call(this, 'appendAndSave', this, options);
      },
      deleteAndSave : function(fieldName, values, cascadeDelete, options) {
        options = options || {};
        options[StackMob.ARRAY_FIELDNAME] = fieldName;
        options[StackMob.ARRAY_VALUES] = values;
        options[StackMob.CASCADE_DELETE] = cascadeDelete;

        var model = this;
        options["stackmob_ondeleteAndSave"] = function(){
            var existingValues = model.get(fieldName);
            model.set(fieldName, _.difference(existingValues, values) );
        };
        StackMob.sync.call(this, 'deleteAndSave', this, options);
      },
      setBinaryFile : function(fieldName, filename, filetype, base64EncodedData) {
        var binaryValueString = 'Content-Type: ' + filetype + '\n' + 'Content-Disposition: attachment; ' + 'filename=' + filename + '\n' + 'Content-Transfer-Encoding: base64\n\n' + base64EncodedData;
        this.set(fieldName, binaryValueString);
      },
      incrementOnSave : function(fieldName, value) {
        if(this.attributes[this.idAttribute]) {
          //if we already have a field by this name declared on our object, remove it (because we are going to create a new one with a [inc] appended
          if(this.attributes[fieldName]) {
            delete this.attributes[fieldName];
          }
          this.set(fieldName + '[inc]', value);
        } else {
          StackMob.throwError('Please specify an id for the row you wish to update. When creating a new instance of your object, you need to pass in JSON that includes the id field and value (e.g. var user = new StackMob.User({ username: \'chucknorris\' });)  Or, for custom objects: var todoInstance = new Todo({todo_id : \'1234\'})');
        }
      },
      decrementOnSave : function(fieldName, value) {
        this.incrementOnSave(fieldName, value * -1);
      }
    });

  };
  var createStackMobCollection = function() {
    StackMob.Collection = Backbone.Collection.extend({
      initialize : function() {
        this.model || StackMob.throwError('Please specify a StackMob.Model for this collection. e.g., var Items = StackMob.Collection.extend({ model: Item });');
        this.schemaName = (new this.model()).schemaName;
      },
      url : function() {
        var base = StackMob.getBaseURL();
        base += this.schemaName;
        return base;
      },
      parse : function(data, xhr) {
        if(!data || (data && (!data['text'] || data['text'] == '')))
          return data;

        var attrs = JSON.parse(data['text']);
        return attrs;
      },
      sync : function(method, model, options) {
        StackMob.sync.call(this, method, this, options);
      },
      query : function(stackMobQuery, options) {
        options = options || {};
        _.extend(options, {
          query : stackMobQuery
        })
        this.fetch(options);
      },
      destroyAll : function(stackMobQuery, options) {
        options = options || {};
        var theCollection = this;
        var success = options['success']; // original
        var successFunc = function(model) {
          // model is undefined
          theCollection.remove(theCollection.models);
          if (typeof success == 'function') success(model);
        };
        options['success'] = successFunc;
        _.extend(options, { query : stackMobQuery });
        return (this.sync || Backbone.sync).call(this, 'delete', this, options);
      },
      create : function(model, options) {
        var newOptions = {};
        newOptions[StackMob.FORCE_CREATE_REQUEST] = true;
        _.extend(newOptions, options);
        StackMob.wrapStackMobCallbacks.call(this, newOptions);
        Backbone.Collection.prototype.create.call(this, model, newOptions);
      },

      fetch : function(options) {
        StackMob.wrapStackMobCallbacks.call(this, options);
        Backbone.Collection.prototype.fetch.call(this, options);
      },

      createAll : function(options) {
        options = options || {};
        return (this.sync || Backbone.sync).call(this, 'create', this, options); 
      },

      count : function(stackMobQuery, options) {
        stackMobQuery = stackMobQuery || new StackMob.Collection.Query();
        options = options || {};
        options.stackmob_count = true;
        var success = options['success'];

        var successFunc = function(xhr) {

          if(xhr && xhr.getAllResponseHeaders) {
            var responseHeader = xhr.getResponseHeader('Content-Range');
            var count = 0;
            if(responseHeader) {
              count = responseHeader.substring(responseHeader.indexOf('/') + 1, responseHeader.length)
            }

            if(count === 0) {
              try {
                count = JSON.parse(xhr.responseText).length
              } catch(err) {
              }
            }

            if(success) {
              success(count);
            }
          } else
            success(xhr);
          //not actually xhr but actual value
        }

        options.success = successFunc;

        //check to see stackMobQuery is actually a StackMob.Collection.Query object before passing along
        if(stackMobQuery.setRange)
          options.query = (stackMobQuery).setRange(0, 0);
        return (this.sync || Backbone.sync).call(this, 'query', this, options)

      }
    });
  };
  var createStackMobUserModel = function() {
    /**
     * User object
     */
    StackMob.User = StackMob.Model.extend({

      schemaName : StackMob['userSchema'] || StackMob['DEFAULT_LOGIN_SCHEMA'], //StackMob['userSchema'] is deprecated but here for backwards compatibility
      loginField : StackMob['loginField'] || StackMob['DEFAULT_LOGIN_FIELD'],  //StackMob['loginField'] is deprecated but here for backwards compatibility
      passwordField : StackMob['passwordField'] || StackMob['DEFAULT_PASSWORD_FIELD'],  //StackMob['passwordField'] is deprecated but here for backwards compatibility

      idAttribute : this.loginField,

      getPrimaryKeyField : function() {
        return this.loginField;
      },
      create : function(options) {
        options = options || {};
        options['isUserCreate'] = true;
        StackMob.Model.prototype.create.call(this, options);
      },
      isLoggedIn : function(options) {
        options = options || {};
        if ( StackMob._containsCallbacks(options, ['yes', 'no']) ){
          options = StackMob._generateCallbacks(options, {
            'isValidResult': function(result) {
              return typeof result !== "undefined";
            },
            'yes': options['yes'],
            'no': options['no'],
            'error': options['no']
          });
          StackMob.hasValidOAuth(options);
        } else {
          return StackMob.isUserLoggedIn(this.get(this.loginField), options);
        }
      },
      login : function(keepLoggedIn, options) {
        options = options || {};
        var remember = ( typeof keepLoggedIn === 'undefined') ? false : keepLoggedIn;

        StackMob.keepLoggedIn(remember);

        options['data'] = options['data'] || {};

        options['data'][this.loginField] = this.get(this.loginField);
        options['data'][this.passwordField] = this.get(this.passwordField);

        if(StackMob.isOAuth2Mode())
          options['data']['token_type'] = 'mac';

        options['stackmob_onaccessToken'] = StackMob.processLogin;

        (this.sync || Backbone.sync).call(this, (StackMob.isOAuth2Mode() ? 'accessToken' : 'login'), this, options);
      },
      logout : function(options) {
        options = options || {};
        options['data'] = options['data'] || {};

        (this.sync || Backbone.sync).call(this, "logout", this, options);
        StackMob.clearOAuthCredentials();
      },
      loginWithGigya : function(gigyaUID, gigyaTimestamp, gigyaSignature, keepLoggedIn, options) {
        options = options || {};
        var remember = ( typeof keepLoggedIn === 'undefined') ? false : keepLoggedIn;

        StackMob.keepLoggedIn(remember);

        options['data'] = options['data'] || {};
        _.extend(options['data'], {
          "gigya_uid" : gigyaUID,
          "gigya_ts" : gigyaTimestamp,
          "gigya_sig" : gigyaSignature,
          "token_type" : 'mac'
        });

        options['stackmob_ongigyaAccessToken'] = StackMob.processLogin;

        (this.sync || Backbone.sync).call(this, "gigyaAccessToken", this, options);
      },
      linkUserWithGigya : function(gigyaUID, gigyaTimestamp, gigyaSignature, options) {
        options = options || {};
        options['data'] = options['data'] || {};
        _.extend(options['data'], {
          "gigya_uid" : gigyaUID,
          "gigya_ts" : gigyaTimestamp,
          "gigya_sig" : gigyaSignature,
          "token_type" : 'mac'
        });

        (this.sync || Backbone.sync).call(this, "linkUserWithGigya", this, options);
      },
      unlinkUserFromGigya : function(options) {
        (this.sync || Backbone.sync).call(this, "unlinkUserFromGigya", this, options);
      },
      loginWithFacebook : function(facebookAccessToken, keepLoggedIn, options) {
        this.loginWithFacebookToken(facebookAccessToken, keepLoggedIn, options);
      },
      loginWithFacebookToken : function(facebookAccessToken, keepLoggedIn, options) {
        options = options || {};
        var remember = ( typeof keepLoggedIn === 'undefined') ? false : keepLoggedIn;

        StackMob.keepLoggedIn(remember);

        options['data'] = options['data'] || {};
        _.extend(options['data'], {
          "fb_at" : facebookAccessToken,
          "token_type" : 'mac'
        });

        if (options['createIfNeeded'] === true){
          options['stackmob_onfacebookAccessTokenWithCreate'] = StackMob.processLogin;
          options['data'][this['loginField']] = options[this['loginField']] || this.get(this['loginField']);
          (this.sync || Backbone.sync).call(this, "facebookAccessTokenWithCreate", this, options);
        } else {
          options['stackmob_onfacebookAccessToken'] = StackMob.processLogin;
          (this.sync || Backbone.sync).call(this, "facebookAccessToken", this, options);
        }
      },
      loginWithFacebookAutoCreate : function(facebookAccessToken, keepLoggedIn, options){
        options = options || {};
        options['createIfNeeded'] = true;
        this.loginWithFacebookToken(facebookAccessToken, keepLoggedIn, options);
      },
      createUserWithFacebook : function(facebookAccessToken, options) {
        options = options || {};
        options['data'] = options['data'] || {};
        _.extend(options['data'], {
          "fb_at" : facebookAccessToken,
          "token_type" : 'mac'
        });

        options['data'][this.loginField] = options[this['loginField']] || this.get(this['loginField']);

        (this.sync || Backbone.sync).call(this, "createUserWithFacebook", this, options);
      },
      //Use after a user has logged in with a regular user account and you want to add Facebook to their account
      linkUserWithFacebook : function(facebookAccessToken, options) {
        options = options || {};
        options['data'] = options['data'] || {};
        _.extend(options['data'], {
          "fb_at" : facebookAccessToken,
          "token_type" : "mac"
        });

        (this.sync || Backbone.sync).call(this, "linkUserWithFacebook", this, options);
      },
      unlinkUserFromFacebook : function(options) {
        (this.sync || Backbone.sync).call(this, "unlinkUserFromFacebook", this, options);
      },
      loginWithTempAndSetNewPassword : function(tempPassword, newPassword, keepLoggedIn, options) {
        options = options || {};
        options['data'] = options['data'] || {};

        this.set(this.passwordField, tempPassword);
        options['data'][StackMob.newPasswordField] = newPassword;
        this.login(keepLoggedIn, options);
      },
      forgotPassword : function(options) {
        options = options || {};
        options['data'] = options['data'] || {};
        options['data'][this.loginField] = this.get(this.loginField);
        (this.sync || Backbone.sync).call(this, "forgotPassword", this, options);
      },
      resetPassword : function(oldPassword, newPassword, options) {
        options = options || {};
        options['data'] = options['data'] || {};
        options['data']['old'] = {
          password : oldPassword
        };
        options['data']['new'] = {
          password : newPassword
        };
        (this.sync || Backbone.sync).call(this, "resetPassword", this, options);
      },

      sync : function(method, model, options) {
        options = options || {};
        options['stackmob_userschemainfo'] = {
          schemaName: this.schemaName,
          loginField: this.loginField,
          passwordField: this.passwordField
        }; // determine what user schema is making the call.  used eventually for processLogin/refreshSession
        StackMob.Model.prototype.sync.call(this, method, model, options);
      }
    });

    /**
     * Collection of users
     */
    StackMob.Users = StackMob.Collection.extend({
      model : StackMob.User
    });

    /*
     * Object to help users make StackMob Queries
     *
     * //Example query for users with age < 25, order by age ascending.  Return second set of 25 results.
     * var q = new StackMob.Query();
     * q.lt('age', 25).orderByAsc('age').setRange(25, 49);
     */

    StackMob.GeoPoint = function(lat, lon) {
      if(_.isNumber(lat)) {
        // Validate
        if ( lat < -90 || lat > 90 ) { StackMob.throwError("Latitude value must be between -90 and 90 inclusive.") };
        if ( lon < -180 || lon > 180 ) { StackMob.throwError("Longitude value must be between -180 and 180 inclusive.") };

        this.lat = lat;
        this.lon = lon;
      } else {
        // Validate
        if ( lat['lat'] < -90 || lat['lat'] > 90 ) { StackMob.throwError("Latitude value must be between -90 and 90 inclusive.") };
        if ( lat['lon'] < -180 || lat['lon'] > 180 ) { StackMob.throwError("Longitude value must be between -180 and 180 inclusive.") };

        this.lat = lat['lat'];
        this.lon = lat['lon'];
      }
    }

    StackMob.GeoPoint.prototype.toJSON = function() {
      return {
        lat : this.lat,
        lon : this.lon
      };
    }

    StackMob.Model.Query = function() {
      this.selectFields = [];
      this.params = {};
    }

    _.extend(StackMob.Model.Query.prototype, {
      select : function(key) {
        this.selectFields.push(key);
        return this;
      },
      setExpand : function(depth) {
        this.params['_expand'] = depth;
        return this;
      }
    })

    StackMob.Collection.Query = function() {
      this.params = {};
      this.selectFields = [];
      this.orderBy = [];
      this.range = null;
    }

    StackMob.Collection.Query.prototype = new StackMob.Model.Query;
    StackMob.Collection.Query.prototype.constructor = StackMob.Collection.Query;

    function andString(count){
      return "[and" + count + "].";
    }

    function orString(count){
      return "[or" + count + "].";
    }

    //Give the StackMobQuery its methods
    _.extend(StackMob.Collection.Query.prototype, {

      /**
       * Combine a Query with an OR operator between it and
       * the current Query object.
       *
       * Example:
       *   var isAged  = new StackMob.Collection.Query().equals("age", "25");
       *   var isNYC   = new StackMob.Collection.Query().equals("location", "NYC");
       *   var notJohn = new StackMob.Collection.Query().notEquals("name", "john");
       *   var notMary = new StackMob.Collection.Query().equals("location", "SF").notEquals("name", "mary");
       *   var isLA    = new StackMob.Collection.Query().equals("location", "LA");
       *
       *   isAged.and( notJohn.or(notMary).or(isLA) );
       *
       * @param  {StackMob.Collection.Query} b - A query object to OR with this object
       * @return {StackMob.Collection.Query} A new query equivalent to A OR B, where A is the object this method is called on and B is the parameter.
       *
       */
      or : function(b){
        /*
         * Naming convention: A.or(B)
         */

        if (typeof this.orId == "undefined"){
          /*
           * If A is a normal AND query:
           * Clone A into newQuery
           * Clear newQuery's params
           * Assign OR Group# (1)
           * Prefix A params with and[#+1]
           * Prefix B params with and[#+1]
           * Prefix all params with or[#]
           * Set all of the above as newQuery.params
           * Return newQuery
           */

          var a = this;
          var newQuery = this.clone();

          newQuery['params'] = {};  // Reset params that will be populated below
          newQuery['orId'] = 1;     // Only allowed one OR, otherwise orCount++;
          newQuery['andCount'] = 1; // And counts are per or-clause

          var andCounter, keys, parsedAndString;

          // Determine [and#] prefix for A
          keys = _.keys(a.params);
          parsedAndString = "";
          if (keys.length > 1) {
            andCounter = newQuery['andCount']++;
            parsedAndString = andString(andCounter)
          }

          // Copy A's params to newQuery
          for (key in a['params']){
            var newKey = orString(newQuery['orId']) + parsedAndString + key;
            newQuery['params'][newKey] = a['params'][key];
          }

          // Determine [and#] prefix for B
          keys = _.keys(b.params);
          parsedAndString = "";
          if (keys.length > 1) {
            andCounter = newQuery['andCount']++;
            parsedAndString = andString(andCounter)
          }

          // Copy B's params to newQuery
          for (key in b['params']){
            var newKey = orString(newQuery['orId']) + parsedAndString + key;
            if (typeof newQuery['params'][newKey] !== "undefined") {
              throw new Error("Error: You are attempting to OR two or more values for the same field. You should use an mustBeOneOf method instead.");
            } else {
              newQuery['params'][newKey] = b['params'][key];
            }
          }

          return newQuery;

        } else {
          /*
           * If A is already an OR query:
           * Clone A into newQuery
           * Prefix B with and[#+1]
           * Prefix B with or[A.orId]
           * Add B's params to newQuery
           * Return newQuery
           */

          var a = this;
          var newQuery = this.clone();

          // Determine [and#] prefix for B
          keys = _.keys(b.params);
          parsedAndString = "";
          if (keys.length > 1) {
            andCounter = newQuery['andCount']++;
            parsedAndString = andString(andCounter)
          }

          // Copy B's params to newQuery
          for (key in b['params']){
            var newKey = orString(newQuery['orId']) + parsedAndString + key;
            if (typeof newQuery['params'][newKey] !== "undefined") {
              throw new Error("Error: You are attempting to OR two or more values for the same field. You should use an mustBeOneOf method instead.");
            } else {
              newQuery['params'][newKey] = b['params'][key];
            }
          }

          return newQuery;
        }

      },
      /**
       * Combine a Query with an AND operator between it and
       * the current Query object.
       *
       * Example:
       *   var isAged  = new StackMob.Collection.Query().equals("age", "25");
       *   var isNYC   = new StackMob.Collection.Query().equals("location", "NYC");
       *   var notJohn = new StackMob.Collection.Query().notEquals("name", "john");
       *   var notMary = new StackMob.Collection.Query().equals("location", "SF").notEquals("name", "mary");
       *   var isLA    = new StackMob.Collection.Query().equals("location", "LA");
       *
       *   isAged.and( notJohn.or(notMary).or(isLA) );
       *
       * @param  {StackMob.Collection.Query} b - A query object to OR with this object
       * @return {StackMob.Collection.Query} A new query equivalent to A AND B, where A is the object this method is called on and B is the parameter.
       */
      and : function(b){
        /*
         * Naming convention: A.or(B)
         *
         * Combine all params of a and b into one object
         */

        var a = this;
        var newQuery = this.clone();

        for (var key in b['params']){
          newQuery['params'][key] = b['params'][key];
        }

        return newQuery;
      },
      /**
       * Deep clone a Query Object
       * @return {StackMob.Collection.Query} A deep cloned query object with a new child params object
       */
      clone : function(){
        var newQuery = _.clone(this);
        newQuery['params'] = _.clone(this['params']);
        return newQuery;
      },
      addParam : function(key, value) {
        this.params[key] = value;
        return this;
      },
      equals : function(field, value) {
        if (value === "")
          this.params[field + '[empty]'] = true;
        else
          this.params[field] = value;
        return this;
      },
      lt : function(field, value) {
        this.params[field + '[lt]'] = value;
        return this;
      },
      lte : function(field, value) {
        this.params[field + '[lte]'] = value;
        return this;
      },
      gt : function(field, value) {
        this.params[field + '[gt]'] = value;
        return this;
      },
      gte : function(field, value) {
        this.params[field + '[gte]'] = value;
        return this;
      },
      notEquals : function(field, value) {
        if (value === "")
          this.params[field + '[empty]'] = false;
        else
          this.params[field + '[ne]'] = value;
        return this;
      },
      isNull : function(field) {
        this.params[field + '[null]'] = true;
        return this;
      },
      isNotNull : function(field) {
        this.params[field + '[null]'] = false;
        return this;
      },
      mustBeOneOf : function(field, value) {
        var inValue = '';
        if(_.isArray(value)) {
          var newValue = '';
          var size = value.length;
          for(var i = 0; i < size; i++) {
            inValue += value[i];
            if(i + 1 < size)
              inValue += ',';
          }
        } else
          inValue = value;

        this.params[field + '[in]'] = inValue;
        return this;
      },
      orderAsc : function(field) {
        this.orderBy.push(field + ':asc');
        return this;
      },
      orderDesc : function(field) {
        this.orderBy.push(field + ':desc');
        return this;
      },
      setRange : function(start, end) {
        this.range = {
          'start' : start,
          'end' : end
        };
        return this;
      },
      mustBeNear : function(field, smGeoPoint, distance) {
        this.params[field + '[near]'] = smGeoPoint.lat + ',' + smGeoPoint.lon + ',' + distance;
        return this;
      },
      mustBeNearMi : function(field, smGeoPoint, miles) {
        this.mustBeNear(field, smGeoPoint, miles / StackMob.EARTH_RADIANS_MI);
        return this;
      },
      mustBeNearKm : function(field, smGeoPoint, miles) {
        this.mustBeNear(field, smGeoPoint, miles / StackMob.EARTH_RADIANS_KM);
        return this;
      },
      isWithin : function(field, smGeoPoint, distance) {
        this.params[field + '[within]'] = smGeoPoint.lat + ',' + smGeoPoint.lon + ',' + distance;
        return this;
      },
      isWithinMi : function(field, smGeoPoint, distance) {
        this.isWithin(field, smGeoPoint, distance / StackMob.EARTH_RADIANS_MI);
        return this;
      },
      isWithinKm : function(field, smGeoPoint, distance) {
        this.isWithin(field, smGeoPoint, distance / StackMob.EARTH_RADIANS_KM);
        return this;
      },
      isWithinBox : function(field, smGeoPoint1, smGeoPoint2) {
        this.params[field + '[within]'] = smGeoPoint1.lat + ',' + smGeoPoint1.lon + ',' + smGeoPoint2.lat + ',' + smGeoPoint2.lon;
        return this;
      }
    });
    //end extend StackMobQuery.prototype
  };
}).call(this);

(function() {
  var root = this;
  var $ = root.jQuery || root.Ext || root.Zepto;
  _.extend(StackMob, {
    ajaxOptions : {
      'sencha' : function(model, params, method, options) {
        var hash = {};

        // Set up success callback
        var success = params['success'];
        var defaultSuccess = function(response, opt) {

          var result = response && response.responseText ? JSON.parse(response.responseText) : null;
          if(params["stackmob_count"] === true)
            result = response;

          StackMob.onsuccess(model, method, params, result, success, options);

        };
        params['success'] = defaultSuccess;

        // Set up error callback
        var error = params['error'];

        // Build Sencha options
        hash['url'] = params['url'];
        hash['headers'] = params['headers'];
        hash['params'] = params['data'];
        hash['success'] = params['success'];
        hash['disableCaching'] = false;
        hash['method'] = params['type'];

        var defaultError = function(response, options) {
          var responseText = response.responseText || response.text;
          StackMob.onerror(response, responseText, $.Ajax.request, model, hash, error, options);
        }
        params['error'] = defaultError;
        hash['failure'] = params['error'];

        return $.Ajax.request(hash);
      },

      'zepto' : function(model, params, method, options) {

        // Set up success callback
        var success = params['success'];
        var defaultSuccess = function(response, result, xhr) {
          var result = response ? JSON.parse(response) : null;
          StackMob.onsuccess(model, method, params, result, success, options);
        };
        params['success'] = defaultSuccess;

        // Set up error callback
        var error = params['error'];
        var defaultError = function(xhr, errorType, err) {
          var responseText = xhr.responseText || xhr.text;
          StackMob.onerror(xhr, responseText, $.ajax, model, params, error, options);
        }
        params['error'] = defaultError;

        // Build Zepto options
        var hash = {};
        hash['url'] = params['url'];
        hash['headers'] = params['headers'];
        hash['contentType'] = params['headers']['contentType'];
        hash['type'] = params['type'];
        hash['data'] = params['data'];
        hash['success'] = defaultSuccess;
        hash['error'] = defaultError;

        return $.ajax(hash);
      },

      'jquery' : function(model, params, method, options) {

        params['beforeSend'] = function(jqXHR, settings) {
          jqXHR.setRequestHeader("Accept", settings['accepts']);
          if(!_.isEmpty(settings['headers'])) {

            for(key in settings['headers']) {
              jqXHR.setRequestHeader(key, settings['headers'][key]);
            }
          }
        };

        // Set up error callback
        var error = params['error'];
        params['error'] = function(jqXHR, textStatus, errorThrown) {
          // Workaround for Android broswers not recognizing HTTP status code 206.
          // Call the success method on HTTP Status 0 (the bug) and when a range was specified.
          if (jqXHR.status == 0 && params['query'] && (typeof params['query']['range'] === 'object')){
            this.success(jqXHR, textStatus, errorThrown);
            return;
          }
          var responseText = jqXHR.responseText || jqXHR.text;
          StackMob.onerror(jqXHR, responseText, $.ajax, model, params, error, options);
        }

        // Set up success callback
        var success = params['success'];
        var defaultSuccess = function(response, status, xhr) {
          var result;

          if(params["stackmob_count"] === true) {
            result = xhr;
          } else if(response && response.toJSON) {
            result = response;
          } else if(response && (response.responseText || response.text)) {
            var json = JSON.parse(response.responseText || response.text);
            result = json;
          } else if(response) {
            result = response;
          }
          StackMob.onsuccess(model, method, params, result, success, options);

        };
        params['success'] = defaultSuccess;

        return $.ajax(params);
      }

    }
  });
}).call(this);

/*!
 CryptoJS v3.0.2
 code.google.com/p/crypto-js
 (c) 2009-2012 by Jeff Mott. All rights reserved.
 code.google.com/p/crypto-js/wiki/License

 Source: http://crypto-js.googlecode.com/svn/tags/3.0.2/build/rollups/hmac-sha1.js
 */

var CryptoJS = CryptoJS || function(i, j) {
  var f = {}, b = f.lib = {}, m = b.Base = function() {
    function a() {
    }

    return {
      extend : function(e) {
        a.prototype = this;
        var c = new a;
        e && c.mixIn(e);
        c.$super = this;
        return c
      },
      create : function() {
        var a = this.extend();
        a.init.apply(a, arguments);
        return a
      },
      init : function() {
      },
      mixIn : function(a) {
        for(var c in a)a.hasOwnProperty(c) && (this[c] = a[c]);
        a.hasOwnProperty("toString") && (this.toString = a.toString)
      },
      clone : function() {
        return this.$super.extend(this)
      }
    }
  }(), l = b.WordArray = m.extend({
    init : function(a, e) {
      a = this.words = a || [];
      this.sigBytes = e != j ? e : 4 * a.length
    },
    toString : function(a) {
      return (a || d).stringify(this)
    },
    concat : function(a) {
      var e = this.words, c = a.words, o = this.sigBytes, a = a.sigBytes;
      this.clamp();
      if(o % 4)
        for(var b = 0; b < a; b++)
        e[o + b >>> 2] |= (c[b >>> 2] >>> 24 - 8 * (b % 4) & 255) << 24 - 8 * ((o + b) % 4);
      else if(65535 < c.length)
        for( b = 0; b < a; b += 4)
        e[o + b >>> 2] = c[b >>> 2];
      else
        e.push.apply(e, c);
      this.sigBytes += a;
      return this
    },
    clamp : function() {
      var a = this.words, e = this.sigBytes;
      a[e >>> 2] &= 4294967295 << 32 - 8 * (e % 4);
      a.length = i.ceil(e / 4)
    },
    clone : function() {
      var a = m.clone.call(this);
      a.words = this.words.slice(0);
      return a
    },
    random : function(a) {
      for(var e = [], c = 0; c < a; c += 4)
      e.push(4294967296 * i.random() | 0);
      return l.create(e, a)
    }
  }), n = f.enc = {}, d = n.Hex = {
    stringify : function(a) {
      for(var e = a.words, a = a.sigBytes, c = [], b = 0; b < a; b++) {
        var d = e[b >>> 2] >>> 24 - 8 * (b % 4) & 255;
        c.push((d >>> 4).toString(16));
        c.push((d & 15).toString(16))
      }
      return c.join("")
    },
    parse : function(a) {
      for(var e = a.length, c = [], b = 0; b < e; b += 2)
      c[b >>> 3] |= parseInt(a.substr(b, 2), 16) << 24 - 4 * (b % 8);
      return l.create(c, e / 2)
    }
  }, h = n.Latin1 = {
    stringify : function(a) {
      for(var e = a.words, a = a.sigBytes, b = [], d = 0; d < a; d++)
      b.push(String.fromCharCode(e[d >>> 2] >>> 24 - 8 * (d % 4) & 255));
      return b.join("")
    },
    parse : function(a) {
      for(var b = a.length, c = [], d = 0; d < b; d++)
      c[d >>> 2] |= (a.charCodeAt(d) & 255) << 24 - 8 * (d % 4);
      return l.create(c, b)
    }
  }, k = n.Utf8 = {
    stringify : function(a) {
      try {
        return decodeURIComponent(escape(h.stringify(a)))
      } catch(b) {
        throw Error("Malformed UTF-8 data");
      }
    },
    parse : function(a) {
      return h.parse(unescape(encodeURIComponent(a)))
    }
  }, g = b.BufferedBlockAlgorithm = m.extend({
    reset : function() {
      this._data = l.create();
      this._nDataBytes = 0
    },
    _append : function(a) {"string" == typeof a && ( a = k.parse(a));
      this._data.concat(a);
      this._nDataBytes += a.sigBytes
    },
    _process : function(a) {
      var b = this._data, c = b.words, d = b.sigBytes, f = this.blockSize, g = d / (4 * f), g = a ? i.ceil(g) : i.max((g | 0) - this._minBufferSize, 0), a = g * f, d = i.min(4 * a, d);
      if(a) {
        for(var h = 0; h < a; h += f)
        this._doProcessBlock(c, h);
        h = c.splice(0, a);
        b.sigBytes -= d
      }
      return l.create(h, d)
    },
    clone : function() {
      var a = m.clone.call(this);
      a._data = this._data.clone();
      return a
    },
    _minBufferSize : 0
  });
  b.Hasher = g.extend({
    init : function() {
      this.reset()
    },
    reset : function() {
      g.reset.call(this);
      this._doReset()
    },
    update : function(a) {
      this._append(a);
      this._process();
      return this
    },
    finalize : function(a) {
      a && this._append(a);
      this._doFinalize();
      return this._hash
    },
    clone : function() {
      var a = g.clone.call(this);
      a._hash = this._hash.clone();
      return a
    },
    blockSize : 16,
    _createHelper : function(a) {
      return function(b, c) {
        return a.create(c).finalize(b)
      }
    },
    _createHmacHelper : function(a) {
      return function(b, c) {
        return p.HMAC.create(a, c).finalize(b)
      }
    }
  });
  var p = f.algo = {};
  return f
}(Math); (function() {
  var i = CryptoJS, j = i.lib, f = j.WordArray, j = j.Hasher, b = [], m = i.algo.SHA1 = j.extend({
    _doReset : function() {
      this._hash = f.create([1732584193, 4023233417, 2562383102, 271733878, 3285377520])
    },
    _doProcessBlock : function(f, i) {
      for(var d = this._hash.words, h = d[0], k = d[1], g = d[2], j = d[3], a = d[4], e = 0; 80 > e; e++) {
        if(16 > e)
          b[e] = f[i + e] | 0;
        else {
          var c = b[e - 3] ^ b[e - 8] ^ b[e - 14] ^ b[e - 16];
          b[e] = c << 1 | c >>> 31
        }
        c = (h << 5 | h >>> 27) + a + b[e];
        c = 20 > e ? c + ((k & g | ~k & j) + 1518500249) : 40 > e ? c + ((k ^ g ^ j) + 1859775393) : 60 > e ? c + ((k & g | k & j | g & j) - 1894007588) : c + ((k ^ g ^ j) - 899497514);
        a = j;
        j = g;
        g = k << 30 | k >>> 2;
        k = h;
        h = c
      }
      d[0] = d[0] + h | 0;
      d[1] = d[1] + k | 0;
      d[2] = d[2] + g | 0;
      d[3] = d[3] + j | 0;
      d[4] = d[4] + a | 0
    },
    _doFinalize : function() {
      var b = this._data, f = b.words, d = 8 * this._nDataBytes, h = 8 * b.sigBytes;
      f[h >>> 5] |= 128 << 24 - h % 32;
      f[(h + 64 >>> 9 << 4) + 15] = d;
      b.sigBytes = 4 * f.length;
      this._process()
    }
  });
  i.SHA1 = j._createHelper(m);
  i.HmacSHA1 = j._createHmacHelper(m)
})(); (function() {
  var i = CryptoJS, j = i.enc.Utf8;
  i.algo.HMAC = i.lib.Base.extend({
    init : function(f, b) {
      f = this._hasher = f.create();
      "string" == typeof b && ( b = j.parse(b));
      var i = f.blockSize, l = 4 * i;
      b.sigBytes > l && ( b = f.finalize(b));
      for(var n = this._oKey = b.clone(), d = this._iKey = b.clone(), h = n.words, k = d.words, g = 0; g < i; g++)h[g] ^=1549556828, k[g] ^=909522486;
      n.sigBytes = d.sigBytes = l;
      this.reset()
    },
    reset : function() {
      var f = this._hasher;
      f.reset();
      f.update(this._iKey)
    },
    update : function(f) {
      this._hasher.update(f);
      return this
    },
    finalize : function(f) {
      var b = this._hasher, f = b.finalize(f);
      b.reset();
      return b.finalize(this._oKey.clone().concat(f))
    }
  })
})();

/*!
 Source: http://crypto-js.googlecode.com/svn/tags/3.0.2/build/components/enc-base64-min.js
 */
(function() {
  var h = CryptoJS, i = h.lib.WordArray;
  h.enc.Base64 = {
    stringify : function(b) {
      var e = b.words, f = b.sigBytes, c = this._map;
      b.clamp();
      for(var b = [], a = 0; a < f; a += 3)
      for(var d = (e[a >>> 2] >>> 24 - 8 * (a % 4) & 255) << 16 | (e[a + 1 >>> 2] >>> 24 - 8 * ((a + 1) % 4) & 255) << 8 | e[a + 2 >>> 2] >>> 24 - 8 * ((a + 2) % 4) & 255, g = 0; 4 > g && a + 0.75 * g < f; g++)
      b.push(c.charAt(d >>> 6 * (3 - g) & 63));
      if( e = c.charAt(64))
        for(; b.length % 4; )
        b.push(e);
      return b.join("")
    },
    parse : function(b) {
      var b = b.replace(/\s/g, ""), e = b.length, f = this._map, c = f.charAt(64);
      c && ( c = b.indexOf(c), -1 != c && ( e = c));
      for(var c = [], a = 0, d = 0; d < e; d++)
      if(d % 4) {
        var g = f.indexOf(b.charAt(d - 1)) << 2 * (d % 4), h = f.indexOf(b.charAt(d)) >>> 6 - 2 * (d % 4);
        c[a >>> 2] |= (g | h) << 24 - 8 * (a % 4);
        a++
      }
      return i.create(c, a)
    },
    _map : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
  }
})();
