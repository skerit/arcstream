var Blast = __Protoblast,
    ChildProcess = require('child_process'),
    RarFile = require('./rar_file'),
    fs = require('fs'),
    Fn = Blast.Bound.Function,
    ArcStream;

/**
 * The ArcStream class
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ArcStream = Fn.inherits('Informer', function ArcStream() {

	// The type of archive we're extracting
	this.type = 'rar';

	// The tempid
	this.tempid = Date.now() + '-' + ~~(Math.random()*10e5);

	// The temppath
	this.temppath = null;

	// The last used part
	this.lastpart = null;

	// The last queued part
	this.lastqueue = null;

	this.files = [];

});

/**
 * Prepare a temporary folder
 *
 * @author   Jelle De Loecker   <jelle@kipdola.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @param    {Function}   callback
 */
ArcStream.setMethod(function getTemppath(callback) {

	var that = this;

	if (that.temppath) {
		return callback(null, that.temppath);
	}

	// Create a unique-ish id
	this.temppath = '/tmp/' + this.tempid;

	fs.mkdir(this.temppath, function(err) {
		return callback(err, that.temppath);
	});
});

/**
 * Add a file
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ArcStream.setMethod(function addFile(index, stream) {

	var that = this;

	if (typeof stream == 'string') {
		stream = fs.createReadStream(stream);
	}

	// Pause the stream
	stream.pause();

	// Move the file
	this.getTemppath(function gotPath(err, dirpath) {

		var path = dirpath + '/p' + index + '.' + that.type;

		that.files[index] = {path: path};

		stream.pipe(fs.createWriteStream(path));

		stream.on('end', function copied() {
			that.emit('copied-' + index);
		});
	});

	if (index == 0) {
		this.queueNext();
	}
});

/**
 * Queue the next extraction
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ArcStream.setMethod(function queueNext(callback) {

	var that = this,
	    index;

	if (this.lastqueue == null) {
		this.lastqueue = 0;
	} else {
		this.lastqueue++;
	}

	index = this.lastqueue;

	// Listen for the file to be done
	this.after('copied-' + index, function copiedFile() {
		if (index == 0) {
			that.extractRar();
		}

		if (callback) {
			return callback();
		}
	});
});

/**
 * Extract rar files
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ArcStream.setMethod(function extractRar() {

	var that  = this,
	    args  = ['-kb', '-vp', 'x', 'p0.rar'],
	    files = {},
	    temp  = '',
	    curfile,
	    extractor;

	// Create the extractor process
	extractor = ChildProcess.spawn('unrar', args, {cwd: this.temppath});

	// Listen to the unrar output
	extractor.stdout.on('data', function onExtractorData(data) {

		var output = data.toString(),
		    procent,
		    info;

		// Look for percentages (indicating extraction progress)
		procent = /\u0008{4}\W*(\d+)/.exec(output);

		if (procent) {
			files[curfile].update();
			return;
		}

		// Look for a new message indicating a new file has started
		info = /Extracting.+\n\nExtracting\W+(.*)/.exec(output);

		// Or for a continued file
		if (!info) {
			info = /\n\.\.\.\W+(.*)/.exec(output);
		}

		if (!info) {
			// Probably "extracting from..." info
			return;
		}

		// Trim the filename
		info = info[1].trim();

		// Do nothing if the current file has not changes
		if (curfile && curfile == info) {
			return;
		}

		if (curfile) {
			// End the stream
			files[curfile].end();
		}

		// Create a new file
		curfile = info;
		files[curfile] = new RarFile(that, curfile);
	});

	// Listen for messages on the stderr
	extractor.stderr.on('data', function onStderr(data) {

		temp += data.toString();

		// Ignore any non "insert-disk" messages
		if (temp.indexOf('Insert disk') == -1) {
			return;
		}

		temp = '';

		// Copy the next rar archive
		that.queueNext(function gotNext() {
			// Once it's there, tell rar to keep on unrarring
			extractor.stdin.write('C\n');
		});
	});

	// Listen for the end signal
	extractor.stdout.on('end', function onEnd() {
		// Extractor is done, make sure the last file has ended
		files[curfile].end();
	});
});

module.exports = ArcStream;