var Blast = __Protoblast,
    Fn = Blast.Bound.Function,
    PassThrough = require('stream').PassThrough,
    RarFile;

/**
 * File in RAR archive wrapper
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {ArcStream}   parent
 */
RarFile = Fn.inherits('Informer', function ArcRarFile(parent, filename) {

	// The parent ArcStream instance
	this.parent = parent;

	// The filename inside the rar file
	this.name = filename;

	// The full path to the file
	this.fullpath = parent.temppath + '/' + filename;

	// The byte index (what to read next)
	this.index = 0;

	// The pass-through stream
	this.output = new PassThrough();

	// The current readstream
	this.input = null;

	// Has this ended?
	this.ended = false;

	// Emit this new file
	parent.emit('file', filename, this.output, this);
});

/**
 * Update the streams
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 */
RarFile.setMethod(function update(callback) {

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
		that.emit('error');
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
RarFile.setMethod(function end() {

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

module.exports = RarFile;