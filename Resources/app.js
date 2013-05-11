StackMob = require('ti.stackmob')({
  publicKey : 'YOUR-PUBLIC-KEY',
    secure : true
});
 
/**
 * shows how to login a user
 */
function loginUser() {
	var user = new StackMob.User({
		username : 'toucansam',
		password : 'fruitloops',
	});
	user.login(false, {
		success : function(fullUserModel) {
			Ti.API.debug('User is logged in!');
			Ti.API.info(JSON.stringify(fullUserModel, null, 2));
 
			createLoginRecord();
 
		},
		error : function(error) {
			Ti.API.error(error);
		}
	});
}
 
/**
 * shows how to create a user
 */
function createUser() {
	var user = new StackMob.User({
		username : 'toucansam',
		password : 'fruitloops',
		age : 15,
		favoriteflavors : ["lemon", "blueberry", "prime rib"]
	});
	user.create({
		success : function(model) { debugger;
			Ti.API.info(JSON.stringify(model, null, 2));
		},
		error : function(model, response) { debugger;
			Ti.API.error(model);
			Ti.API.error(response)
		}
	});
 
	Ti.API.info(StackMob.isOAuth2Mode());
}
 
/**
 * shows how to create a new object
 */
function createLoginRecord() {
	var AuditRecord = StackMob.Model.extend({
		schemaName : 'audit_entry'
	});
	// completed will be a boolean field if it's not created already
	var myAuditRecord = new AuditRecord({
		title : 'Logged Into StackMob',
		time_value : new Date(),
	});
	myAuditRecord.create({
		success : function(model) {
			Ti.API.debug('myAuditRecord is saved, _id: ' + model.get('audit_entry_id') + ', title: ' + model.get('title'));
			Ti.API.debug('myAuditRecord is saved, _id: ' + model.get('time_value'));
		},
		error : function(model, response) {
			Ti.API.error(response);
		}
	});
}
 
//
// Lets get things started
//
 
new StackMob.User().isLoggedIn({
  yes : function() {
		console.log("Logged in.");
		createLoginRecord();
	},
	no : function() {
		console.log("Not logged in.");
		loginUser();
	}
});
