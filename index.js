var fs = require('fs'),
	request = require('request'),
	parse = require('xml-parser'),
	mime = require('mime-sniffer'),
	oauthSign = require('oauth-sign'),
	uuid = require('node-uuid'),
	isReadable = require('isstream').isReadable;

var oauthConfig = {};

function getPhotoIdFromXML(xml) {

	var parsed = parse(xml);

	var photoId = null;

	if (parsed && parsed.root && parsed.root.children) {

		parsed.root.children.forEach(function (child) {

			if (child.name === 'photoid') {
				photoId = child.content;
			}

		});

	}

	return photoId;

}

function getErrorFromXML(xml) {

	var parsed = parse(xml);

	var error = null;

	if (parsed && parsed.root && parsed.root.children) {

		parsed.root.children.forEach(function (child) {

			if (child.name === 'err') {
				error = 'Code: ' + child.attributes.code + ', Message: ' + child.attributes.msg;
			}

		});

	}

	return error;

}

/**
 * Collapse a number of oauth query arguments into an
 * alphabetically sorted, URI-safe concatenated string.
 * Taken from https://www.npmjs.com/package/flickrapi
 */
function formQueryString(queryArguments) {

	var args = [],
		append = function (key) {
			args.push(key + "=" + encodeURIComponent(queryArguments[key]));
		};

	Object.keys(queryArguments).sort().forEach(append);

	return args.join("&");

}

function upload(photo, uploadConfig, callback) {

	if (typeof uploadConfig === 'function') {
		callback = uploadConfig;
		uploadConfig = {};
	}

	if (typeof callback === 'undefined') {
		callback = function(){};
	}

	var photoOptions = {
		oauth_signature_method: 'HMAC-SHA1',
		oauth_consumer_key: oauthConfig.consumer_key,
		oauth_token: oauthConfig.token,
		oauth_nonce: uuid().replace(/-/g, ''),
		oauth_timestamp: Math.floor(Date.now()/1000).toString()
	};

	if (uploadConfig) {

		var args = ['title', 'description', 'tags', 'is_public', 'is_friend', 'is_family', 'safety_level', 'content_type', 'hidden'];

		args.forEach(function (arg) {

			if (typeof uploadConfig[arg] !== 'undefined') {
				photoOptions[arg] = uploadConfig[arg].toString();
			}

		});

	}

	var url = "https://up.flickr.com/services/upload/";

	var queryString = formQueryString(photoOptions);

	photoOptions.oauth_signature = oauthSign.sign('HMAC-SHA1', 'POST', url, photoOptions, oauthConfig.consumer_secret, oauthConfig.token_secret);

	var uri = url + '?' + queryString + "&oauth_signature=" + encodeURIComponent(photoOptions.oauth_signature);

	var req = request.post({
		url: uri
	}, function (err, response, body) {

		if (err) {
			return callback(err);
		}

		var parsed = parse(body);

		if (!(parsed && parsed.root && parsed.root.attributes && parsed.root.attributes.stat)) {
			return callback(new Error('Could not parse response.'));
		}

		var stat = parsed.root.attributes.stat;

		if (stat === 'fail') {
			return callback(new Error(getErrorFromXML(body)));
		}

		var photoId = getPhotoIdFromXML(body);

		return callback(null, photoId);

	});

	var form = req.form();

	var appendParams = function () {

		for (var key in photoOptions) {

			value = photoOptions[key];
			form.append(key, value);

		}

	};

	if (photo instanceof Buffer) {

		mime.lookup(photo, function (err, info) {

			var filename = 'photo.' + info.extension;
			var contentType = info.mime;

			if (typeof uploadConfig.filename !== 'undefined') {
				filename = uploadConfig.filename;				
			}

			if (typeof uploadConfig.contentType !== 'undefined') {
				contentType = uploadConfig.contentType;				
			}

			form.append('photo', photo, {
				filename: filename,
				contentType: info.mime,
				knownLength: photo.length
			});

			appendParams();

		});

	} else if (photo && (isReadable(photo) || photo.__isRequestRequest)) {

		var streamParams = {};
		if (uploadConfig && uploadConfig.strip_filename) {
			streamParams.filename = ' ';
		}

		form.append('photo', photo, streamParams);
		appendParams();

	} else {

		form.append('photo', fs.createReadStream(photo));
		appendParams();

	}

}

module.exports = function (oauth) {

	oauthConfig = {};

	if (oauth) {

		// Support the format output by flickr-oauth-dance

		if (oauth.api_key) {
			oauthConfig.consumer_key = oauth.api_key;
		}

		if (oauth.api_secret) {
			oauthConfig.consumer_secret = oauth.api_secret;
		}

		if (oauth.access_token) {
			oauthConfig.token = oauth.access_token;
		}

		if (oauth.access_token_secret) {
			oauthConfig.token_secret = oauth.access_token_secret;
		}

		// This is the standard format

		if (oauth.consumer_key) {
			oauthConfig.consumer_key = oauth.consumer_key;
		}

		if (oauth.consumer_secret) {
			oauthConfig.consumer_secret = oauth.consumer_secret;
		}

		if (oauth.token) {
			oauthConfig.token = oauth.token;
		}

		if (oauth.token_secret) {
			oauthConfig.token_secret = oauth.token_secret;
		}

	}

	return {
		upload: upload
	};

};
