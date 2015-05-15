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

	// How many non-updates have happened
	this.nonupdates = 0;

	// The byte index (what to read next)
	this.index = 0;

	// The pass-through stream
	this.output = new PassThrough();

	// The current readstream
	this.input = null;

	// Has this ended?
	this.ended = false;

	// Function queue for getting the segments
	this.updatequeue = new Blast.Classes.FunctionQueue();

	// Wait at least 1 second between every update
	this.updatequeue.throttle = 1000;

	// Only 1 update at a time
	this.updatequeue.limit = 1;

	// Start the queue
	this.updatequeue.start();

	// The full path to the file on the disk
	this.fullpath = libpath.resolve(parent.temppath, filepath);

	// Emit this new file
	parent.emitFile(this);
});

/**
 * Debug method
 *
 * @author   Jelle De Loecker   <jelle@kipdola.be>
 * @since    0.1.3
 * @version  0.1.3
 */
ArcFile.setMethod(function debug() {

	if (!this.parent.debugMode) {
		return false;
	}

	return this.parent.debug('__debug__', this.constructor.name, arguments);
});

/**
 * Update the streams
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.3
 */
ArcFile.setMethod(function update(callback, delaycount) {

	var that = this;

	if (this.input || this.ended || this.updateScheduled) {

		if (!delaycount) {
			delaycount = 0;
		} else {
			that.debug('Update has been delayed', delaycount, 'times');
		}

		if (delaycount > 10) {
			if (callback) {
				that.debug('This update has waited 10 seconds, calling callback now');
				return callback();
			}
		}

		if (callback) {
			setTimeout(function() {
				that.update(callback, delaycount+1);
			}, 1000);
		}

		return;
	}

	this.updateScheduled = true;

	this.updatequeue.add(function doUpdate() {

		var gained = 0;

		that.debug('Creating readstream at', that.index, 'of file', that.fullpath);

		// Create a readstream to the current outputting file
		that.input = fs.createReadStream(that.fullpath, {
			start: that.index
		});

		// Listen for data
		that.input.on('data', function gotChunk(chunk) {

			// Increment the amount of bytes we already have
			that.index += chunk.length;

			// Count the gained chunks during this update cycle
			gained += chunk.length;

			// Write it to the pass
			that.output.write(chunk);
		});

		// Listen for errors
		that.input.on('error', function onError(err) {
			that.emit('error', err);
		});

		// Listen for the end of the file
		that.input.on('end', function onEnd() {
			that.input = null;

			if (!gained) {
				that.nonupdates++;
			} else {
				that.nonupdates = 0;
			}

			if (callback) {
				callback();
			}

			// If there are too many non-updates, wait an extra long time
			if (that.nonupdates > 2) {
				that.debug('There have been', that.nonupdates, 'non-updates. Waiting 6 seconds before next update');
				setTimeout(function() {
					that.updateScheduled = false;
					that.update();
				}, 6000);

				return;
			}

			that.updateScheduled = false;
			that.update();
		});
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
		that.debug('The extraction has finished');
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