_ = require("underscore");
var Backbone = require('backbone');
Ti.include('2.5.3-crypto-sha1-hmac.js');
require('stackmob-js-0.5.5');

StackMob.init({
	appName : 'people_interact',
	clientSubdomain : 'clearlyinnovative',
	publicKey : '6a2e44eb-30a7-48c4-a7e1-586afdb7f83d',
	apiVersion : 0
});

Ti.API.info(' data ' + JSON.stringify(StackMob));

var user = new StackMob.User({
	username : 'toucansam',
	password : 'fruitloops',
});
user.login(false, {
	success : function(fullUserModel) {
		console.debug('User is logged in!');
		//The full user object is returned
		//Ti.API.info(fullUserModel.toJSON());

		var smQuery = new StackMob.Collection.Query();
		//get all Todo items of high priority, order by createddate in ascending order.
		smQuery.setRange(0, 4).orderAsc('username');
		//or add them individually

		var users = new StackMob.Users();
		//use StackMob.Collection's "query" method to get your results from StackMob
		users.query(smQuery, {
			success : function(collection) {
				//print out the users after the query returns from StackMob
				console.debug(users.toJSON());
			}
		});

	},
	error : function(model, error) {
		Ti.API.info(error);
	}
});

if (false) {
	var user = new StackMob.User({
		username : 'toucansam',
		password : 'fruitloops',
		age : 15,
		favoriteflavors : ["lemon", "blueberry", "prime rib"]
	});
	user.create({
		success : function(model) {
			Ti.API.info(model)
		},
		error : function(model, response) {
			Ti.API.info(model);
			Ti.API.info(response)
		}
	});

	Ti.API.info(StackMob.isOAuth2Mode());
}

//Ti.API.info(' data ' + JSON.stringify(user));