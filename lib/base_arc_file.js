var Blast = __Protoblast,
    Fn = Blast.Bound.Function,
    PassThrough = require('stream').PassThrough,
    libpath = require('path'),
    fs = require('fs'),
    ArcFile;

/**
 * File in RAR archive wrapper
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @param    {ArcStream}   parent      Parent archive instance
 * @param    {String}      filepath    Path + filename inside the archive
 */
ArcFile = Fn.inherits('Informer', function ArcBaseFile(parent, filepath) {

	// The parent ArcStream instance
	this.parent = parent;

	// The filename inside the rar file
	this.name = libpath.basename(filepath);

	// The extension of the file, without the dot
	this.extension = libpath.extname(filepath).slice(1);

	// The directory the file is in (inside the archive)
	this.directory = libpath.dirname(filepath);

	if (this.directory == '.') {
		this.directory = '';
	}

	// The byte index (what to read next)
	this.index = 0;

	// The pass-through stream
	this.output = new PassThrough();

	// The current readstream
	this.input = null;

	// Has this ended?
	this.ended = false;

	// The full path to the file on the disk
	this.fullpath = libpath.resolve(parent.temppath, filepath);

	// Emit this new file
	parent.emitFile(this);
});

/**
 * Update the streams
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ArcFile.setMethod(function update(callback) {

	var that = this;

	if (this.input || this.ended) {
		return;
	}

	// Create a readstream to the current outputting file
	this.input = fs.createReadStream(this.fullpath, {
		start: this.index
	});

	// Listen for data
	this.input.on('data', function gotChunk(chunk) {

		// Increment the amount of bytes we already have
		that.index += chunk.length;

		// Write it to the pass
		that.output.write(chunk);
	});

	// Listen for errors
	this.input.on('error', function onError(err) {
		that.emit('error', err);
	});

	// Listen for the end of the file
	this.input.on('end', function onEnd() {
		that.input = null;

		if (callback) {
			callback();
		}
	});
});

/**
 * Indicate this file should be done
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ArcFile.setMethod(function end() {

	var that = this;

	if (this.ended) {
		return;
	}

	function finish() {
		that.ended = true;
		that.output.end();
	}

	if (this.input) {
		return this.input.on('end', function() {
			// Schedule 1 more update, just in case
			that.update(finish);
		});
	}

	this.update(finish);
});

module.exports = ArcFile;