var express			= require('express');
var extip			= require('external-ip');
var localip			= require('ip');
var cookieParser	= require('cookie-parser');
var bodyParser		= require('body-parser');
var fs				= require('fs');
var dateUtils		= require('date-utils');
var uaParser		= require('ua-parser-js');

var app				= express();
var externalip		= extip();
var PORT			= 8080;
var SAMPLE_LEN		= 30;
var logFile			= './log.txt';
var indexHtml		= './index.html';
var mainHtml		= './main.html';
var logMainHtml		= './log.html';
var logSearchHtml	= './search.html';
var searchOutput	= [
	'ipAddress', 'protocol', 'hostname', 'baseUrl',
	'cookies', 'query', 'date', 'userAgent',
	'browser', 'os', 'cpu'
];

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : true}));


app.listen(PORT, function() {
	console.log('Waiting for Clients');
	console.log('\tport          : ', PORT);
	console.log('\tip (local)    : ', localip.address());
	
	externalip(function(err, ip) {
		handleError(err, 'Failed to get external IP');
		console.log('\tip (external) : ', ip);
	});
});

app.get('/', function(req, res) {
	var count = req.cookies.count1
		? parseInt(req.cookies.count1, 10) + 1 : 1;
	req.cookies.count1 = count;

	writeResult(req, function(result) {
		res.cookie('count1', count);
		showIndex(res, result);
	});
});

function writeResult(req, callBack)
{
	var userAgent	= req.headers['user-agent'];
	var uaRes		= uaParser(userAgent);

	var browser		= uaRes.browser.name + ' ' + uaRes.browser.version;
	var os			= uaRes.os.name + ' ' + uaRes.os.version;
	var cpu			= uaRes.cpu.architecture;

	var result = {
		'ipAddress'		: req.ip,
		'protocol'		: req.protocol,
		'hostname'		: req.hostname,
		'baseUrl'		: req.baseUrl,
		'cookies'		: JSON.stringify(req.cookies),
		'query'			: JSON.stringify(req.query),
		'date'			: (new Date()).toFormat('YYYY-MM-DD HH24:MI:SS'),
		'userAgent'		: userAgent,
		'browser'		: browser,
		'os'			: os,
		'cpu'			: cpu
	};

	logInfo(result);
	callBack(result);
};

function logInfo(info)
{
	var str = JSON.stringify(info);
	fs.writeFile(logFile, str + '\n', {flag : 'a'}, function(err, data)
	{
		handleError(err, 'Failed to write log file');

		var omit	= SAMPLE_LEN < str.length ? ' ... ' : '';
		var len		= Math.min(SAMPLE_LEN, str.length) / 2; 
		var head	= str.substring(0, len);
		var foot	= str.substring(str.length - len);
	
		console.log(
			'New log (' + logFile + ') : ',
			'\t' + head + omit + foot
		);
	});
}

function showIndex(res, info)
{
	fs.readFile(indexHtml, function(err, data) {
		handleError(err, 'Failed to read index html');
		var content = '';

		for(var key in info)
		{
			if(info.hasOwnProperty(key))
			{
				content += '\t\t\t<tr>';
				content += '<td>' + key + '</td>\t';
				content += '<td>' + info[key] + '</td>';
				content += '</tr>\n';
			}
		}

		var result = data.toString().replace('$content', content);
		res.end(result);
	});
};

app.use(/^\/(a\D*)(\d*)/, function(req, res) {
	var count = req.cookies.count2 ?
		parseInt(req.cookies.count2, 10) + 1 : 1;
	req.cookies.count2	= count;
	req.cookies.word	= req.params[0];
	req.cookies.number	= req.params[1];

	writeResult(req, function(result) {
		res.cookie('count2', count);
		res.cookie('word', req.params[0]);
		res.cookie('number', req.params[1]);

		showMain(res, result);
	});
});

function showMain(res, info)
{
	fs.readFile(mainHtml, function(err, data) {
		handleError(err, 'Failed to read main html');
		var result = data.toString();

		for(var i = 0; i < searchOutput.length; ++i)
		{
			var key		= searchOutput[i];
			var value	= info[searchOutput[i]];
			var str		= '[' + key + ']<br><br>' + value;

			result = result.replace('$' + key, str);
		}

		res.end(result);
	});
};

app.use('/log', function(req, res) {
	if(req.query.q) searchQuery(res, req.query.q)
	else if(req.body.q) searchQuery(res, req.body.q)
	else
	{
		fs.readFile(logMainHtml, function(err, data) {
			handleError(err, 'Failed to read log main html');
			res.end(data);
		});
	}
});

function searchQuery(res, q)
{
	fs.readFile(logSearchHtml, function(errHtml, dataHtml) {
		handleError(errHtml, 'Failed to read log search html');

		fs.readFile(logFile, {flag : 'r+'}, function(errLog, dataLog) {
			handleError(errLog, 'Failed to read log file');

			var log		= dataLog ? dataLog.toString().split('\n') : [];
			var content	= '<tr>';
			var isEmpty	= true;

			for(var j = 0; j < searchOutput.length; ++j)
			{
				content += '<td>' + searchOutput[j] + '</td>';
			}

			content += '</tr>\n';

			try
			{
				for(var i = 0; i < log.length; ++i)
				{
					if(!log[i].match(q)) continue;
				
					var json		= JSON.parse(log[i]);
					var isMatched	= false;
					var row			= '<tr>';

					for(var j = 0; j < searchOutput.length; ++j)
					{
						var str = json[searchOutput[j]];

						if(!str)
						{
							row += '<td></td>';
							continue;
						}

						str = simplifyResult(str);
						var match = str.match(q);

						result = formatQueryResult(str, match);
						row += '<td>' + result + '</td>';

						isMatched = true;
					}

					if(isMatched)
					{
						content += row + '</tr>\n'
						isEmpty = false;
					}
				}

				if(isEmpty)
				{
					content = '<p align="center">No Result</p>';
					content = '<tr><td><b>' + content + '</b></tr></td>';
				}
			}
			catch(e)
			{
				content = '<p align="center">Wrong Query</p>';
				content = '<tr><td><b>' + content + '</b></tr></td>';
			}

			var str = dataHtml.toString();
			var result = str.replace(/\$query/g, '"' + q + '"')
			result = result.replace('$content', content);	
			res.end(result);
		});
	});
};

function simplifyResult(str)
{
	return str.replace(/\\/g, '').replace(/"/g, ' ');
}

function formatQueryResult(str, match)
{
	if(!match) return str;

	var first	= match.index;
	var last	= first + match[0].length;

	var head	= str.substring(0, first);
	var body	= str.substring(first, last);
	var foot	= str.substring(last);

	return head + '<font color="red">' + body + '</font>' + foot;
}

app.use(/^\/img\/(.*)/, function(req, res) {
	fs.readFile('./img/' + req.params[0], function(err, data) {
		handleError(err, 'Failed to load image');
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end(data);
	});
});

function handleError(err, msg)
{
	if(err)
	{
		console.error(err);
		console.error(msg);
	}
};
