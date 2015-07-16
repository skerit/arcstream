var ChildProcess = require('child_process'),
    PassThrough  = require('stream').PassThrough,
    BaseFile     = require('./base_arc_file'),
    libpath      = require('path'),
    RarFile      = require('./rar_file'),
    TarFile      = require('./tar_file'),
    rimraf       = require('rimraf'),
    mmm          = require('mmmagic'),
    mkdirp       = require('mkdirp'),
    Magic        = mmm.Magic,
    magic        = new Magic(mmm.MAGIC_MIME_TYPE),
    fs           = require('graceful-fs'),
    ArcStream,
    Blast,
    Fn;

// Require protoblast (without native mods) if it isn't loaded yet
if (typeof __Protoblast == 'undefined') {
	Blast = require('protoblast')(false);
} else {
	Blast = __Protoblast;
}

Fn = Blast.Bound.Function;

/**
 * The ArcStream class
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.4
 */
ArcStream = Fn.inherits('Informer', function ArcStream(config) {

	if (!config) {
		config = {};
	}

	// The type of archive we're extracting
	this.type = null;

	// The tempid
	this.tempid = Date.now() + '-' + ~~(Math.random()*10e5);

	// Where to store our temporary files
	this.tempdir = config.tempdir || '/tmp';

	// Clean up files on exit?
	if (typeof config.cleanup == 'undefined') {
		this.cleanup = true;
	} else {
		this.cleanup = config.cleanup;
	}

	// Debug mode
	this.debugMode = config.debug || false;

	// The temppath
	this.temppath = null;

	// The last used part
	this.lastpart = null;

	// The last queued part
	this.lastqueue = null;

	// Is this a multipart file
	this.multipart = null;

	// The added files
	this.files = [];

	// The extracted files
	this.extracted = [];

	// Copied file info
	this.copiedInfo = {};

	// Already seen requests
	this.seenRequests = [];

	// Extract nested archives by default
	this.extractNested = true;

	// Handle nested archives
	this.subArchive = null;

	// Is this archive corrupt?
	this.corrupt = null;
});

/**
 * Output debug message
 *
 * @author   Jelle De Loecker   <jelle@kipdola.be>
 * @since    0.1.3
 * @version  0.1.3
 */
ArcStream.setMethod(function debug(dtest, info, args) {

	if (this.debugMode) {

		if (dtest == '__debug__') {
			args = Array.prototype.slice.call(args);
			args.unshift('[' + info + '] ');
		} else {
			args = Array.prototype.slice.call(arguments);
			args.unshift('[ARCSTREAM] ');
		}

		console.log.apply(console, args);
		return true;
	}

	return false;
});

/**
 * Prepare a temporary folder
 *
 * @author   Jelle De Loecker   <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.3
 *
 * @param    {Function}   callback
 */
ArcStream.setMethod(function getTemppath(callback) {

	var that = this;

	if (that.temppath) {
		this.after('createdTempDir', function() {
			callback(null, that.temppath);
		});
		return;
	}

	// Create a unique-ish id
	this.temppath = libpath.resolve(this.tempdir, this.tempid);

	mkdirp(this.temppath, function createdDir(err) {
		that.emit('createdTempDir');
		return callback(err, that.temppath);
	});

	// Make sure the temppath is removed on exit
	process.on('exit', function onExit() {
		if (that.temppath && that.cleanup) {
			rimraf.sync(that.temppath);
		}
	});
});

/**
 * Add an archive file to be extracted
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.3
 *
 * @param    {Number}         index    Index of the file, first one is 0 (optional)
 * @param    {String|Stream}  stream   Path to archive or readstream
 * @param    {String}         type     Type of the archive
 */
ArcStream.setMethod(function addFile(index, stream, type) {

	var that = this,
	    multipart;

	if (typeof index != 'number') {
		type = stream;
		stream = index;
		index = this.files.length;
	}

	if (typeof stream == 'string') {
		stream = fs.createReadStream(stream);
	}

	this.files.push({stream: stream, type: type});

	// Pause the read stream
	stream.pause();

	Fn.series(function getType(next) {

		// Continue if the type has already been provided
		if (type) {
			return next();
		}

		// Attempt to get the mimetype from the first chunk of data
		stream.once('data', function onFirstData(chunk) {

			// Pause the stream again
			stream.pause();

			// Push this chunk back to the top
			stream.unshift(chunk);

			magic.detect(chunk, function gotType(err, result) {

				if (err) {
					return next(err);
				}

				type = result;
				next();
			});
		});

		stream.resume();
	}, function checkMultipart(next) {

		if (this.multipart != null) {
			return next();
		}

		if (type.indexOf('rar') > -1) {
			that.multipart = true;
			that.type = 'rar';
		} else {
			that.multipart = false;
			that.type = type;
		}

		next();
	}, function copyMultiparts(next) {

		if (!that.multipart) {
			return next();
		}

		// Move the multipart file
		that.getTemppath(function gotPath(err, dirpath) {

			var tempname = 'p' + index + '.' + that.type,
			    path = dirpath + '/' + tempname,
			    writeStream;

			that.files[index] = {path: path};

			// Create the writestream
			writeStream = fs.createWriteStream(path);

			// Pipe the original stream into the writestream
			stream.pipe(writeStream);

			// Wait for the writestream (not the readstream) to be finished
			writeStream.on('finish', function copied() {

				that.debug('Archive part', index, 'has been written to disk as', tempname);

				that.copiedInfo['copied-' + index] = {name: tempname, path: path};
				that.emit('copied-' + index, tempname, path);
			});
		});

		if (index == 0) {
			that.queueNext();
		}
	}, function handleSinglepart(err) {

		if (err) {
			throw err;
		}

		if (that.multipart) {
			return;
		}

		if (type.indexOf('tar') > -1) {
			that.extractTar(stream);
		} else if (type.indexOf('gzip') > -1) {
			that.extractTar(stream, 'z');
		} else if (type.indexOf('bzip2') > -1 || type.indexOf('bz2') > -1) {
			that.extractTar(stream, 'j');
		} else if (type.indexOf('zip') > -1) {
			throw new Error('ZIP is not yet supported');
		} else {
			throw new Error('Unknown archive: ' + type);
		}
	});
});

/**
 * Handle extracted files
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @param    {ArcBaseFile}   arcfile
 */
ArcStream.setMethod(function emitFile(arcfile) {

	var that = this;

	// Push this to the extracted files
	this.extracted.push(arcfile);

	// If the new file is in itself an archive, intercept it!
	if (this.extractNested !== false && /bz2|gz|tgz|tar|rar|r\d\d/.exec(arcfile.extension)) {

		if (!this.subArchive) {
			this.subArchive = new ArcStream();
			this.subArchive.nested = true;

			this.subArchive.on('file', function onNestedFile(name, stream, subarc) {
				that.emit('file', name, stream, subarc);
			});

			this.subArchive.on('error', function onSubError(err) {
				that.emit('error', err);
			});
		}

		return this.subArchive.addFile(arcfile.output, arcfile.extension);
	}

	this.emit('file', arcfile.name, arcfile.output, arcfile);
});

/**
 * Emit the done event
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.4
 * @version  0.1.4
 */
ArcStream.setMethod(function emitDone() {

	if (this.done) {
		return;
	}

	this.done = true;
	this.emit('done', this.files);
});

/**
 * Queue the next extraction (for multipart archives)
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.2
 *
 * @param    {Function}
 */
ArcStream.setMethod(function queueNext(expectedName, callback) {

	var that = this,
	    copyid,
	    index;

	if (typeof expectedName == 'function') {
		callback = expectedName;
		expectedName = null;
	}

	if (this.lastqueue == null) {
		this.lastqueue = 0;
	} else {
		this.lastqueue++;
	}

	if (expectedName && this.seenRequests.indexOf(expectedName) > -1) {
		this.lastqueue--;
	}

	// Remember this request
	this.seenRequests.push(expectedName);

	index = this.lastqueue;
	copyid = 'copied-' + index;

	// Listen for the file to be done
	this.after(copyid, function copiedFile() {

		Fn.series(function checkNames(next) {

			var filename = that.copiedInfo[copyid].name,
			    fullpath = that.copiedInfo[copyid].path;

			if (filename == expectedName) {
				return next();
			}

			// Create a symlink to the actual filename
			fs.symlink(fullpath, libpath.resolve(libpath.dirname(fullpath), expectedName), function created(err) {
				that.debug('Created symlink from', libpath.basename(fullpath), 'to expected name', expectedName);
				next();
			});
		}, function done() {
			if (index == 0) {
				that.extractRar();
			}

			if (callback) {
				return callback();
			}
		});
	});
});

/**
 * Extract tar files
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Stream}   input   Readstream to tar file
 * @param    {String}   arg     Extra argument for tar command
 */
ArcStream.setMethod(function extractTar(input, arg) {

	var that  = this,
	    args,
	    path,
	    files,
	    prevbuf,
	    curfile,
	    extractor;

	files = {};
	args = ['xvvfO', '-', '--checkpoint'];

	if (arg) {
		args[0] += arg;
	}

	Fn.series(function getPath(next) {
		that.getTemppath(function gotPath(err, temppath) {
			path = temppath;
			return next();
		});
	}, function done() {

		// Create the TAR extractor process
		extractor = ChildProcess.spawn('tar', args, {cwd: path});

		// Listen to the tar output, where decompressed data will go to
		extractor.stdout.on('data', function onExtractorData(data) {

			// Sometimes file data comes before the filename
			if (prevbuf) {
				if (curfile) {
					files[curfile].update(prevbuf);
				} else {
					prevbuf = Buffer.concat([prevbuf, data]);
					return;
				}
			}

			if (curfile) {
				prevbuf = files[curfile].update(data);
			} else {
				prevbuf = data;
			}
		});

		// Listen for messages on the stderr
		extractor.stderr.on('data', function onStderr(data) {

			var info = data.toString().trim();

			if (info.indexOf('not recoverable') > -1 || info.indexOf('exiting now') > -1) {
				throw new Error('TAR extractor encountered an error');
			}

			if (info.slice(0, 4) == 'tar:') {
				// This is just a progress update
				return;
			}

			// Extract expected filesize & filename
			info = /.+?(\d+) \d+-\d+-\d+ \d\d\:\d\d (.+)\b/.exec(info);

			if (!info) {
				return;
			}

			if (curfile) {
				prevbuf = files[curfile].end(prevbuf);
			}

			// Create new file
			curfile = info[2];
			files[curfile] = new TarFile(that, curfile, Number(info[1]));
		});

		// Listen for the end
		extractor.stdout.on('end', function onEnd() {
			// Tar extractor has finished, make sure the last file has ended
			if (files[curfile]) {
				files[curfile].end(prevbuf);
			}
		});

		// Pipe the input stream into the tar process
		input.pipe(extractor.stdin);
	});
});

/**
 * Extract rar files
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.3
 */
ArcStream.setMethod(function extractRar() {

	var that  = this,
	    args  = ['-kb', '-vp', 'x', 'p0.rar'],
	    files = {},
	    temp  = '',
	    outtemp = '',
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
		procent = /\u0008{4}\W*(\d+)%/.exec(output);

		// Sometimes procentages and filenames are on the same line
		output = output.replace(/\u0008{4}\W*\d+%/g, '').trim();

		if (!output && procent) {
			outtemp = '';
			if (curfile) files[curfile].update();
			return;
		}

		outtemp += output;

		// Look for a new message indicating a new file has started
		info = /Extracting.+\n\nExtracting\W+(.*)/.exec(output);

		if (!info) {
			info = /Extracting (?!:from)\W+(.*)/.exec(output);
		}

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

		// Remove possible \b characters
		info = info.replace(/\u0008/g, ' ');

		// Remove trailing "OK" message, if present
		if (/\W{2,}OK$/.exec(info)) {
			info = info.slice(0, -2).trim();
		}

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

		var nextName;

		temp += data.toString();

		// Look for wrong volume order error messages
		if (temp.indexOf('previous volume') > -1) {
			return that.emit('error', new Error(temp));
		}

		// Look for checksum errors
		if (temp.indexOf('checksum error in') > -1) {
			console.error('ARC ERR »» '+temp);
			return that.emit('error', new Error('Checksum error'));
		}

		// Ignore any non "insert-disk" messages
		if (temp.indexOf('Insert disk') == -1) {
			return;
		}

		// Get the expected name of the next archive
		nextName = /with (.+) \[C\]ontinue,/.exec(temp);

		if (nextName) {
			nextName = nextName[1];
		}

		// We really need a next name to wait for
		if (!nextName) {
			return;
		}

		temp = '';

		// Copy the next rar archive
		that.queueNext(nextName, function gotNext() {

			// Reset the outtemp string
			outtemp = '';

			// Once it's there, tell rar to keep on unrarring
			extractor.stdin.write('C\n');
		});
	});

	// Listen for the end signal
	extractor.stdout.on('end', function onEnd() {

		if (outtemp.indexOf('All OK') == -1) {
			// Something went wrong during extraction
			that.corrupt = true;
			that.emit('corrupted', outtemp);
		} else {
			// Extraction succeeded!
			that.corrupt = false;
		}

		// Extractor is done, make sure the last file has ended
		if (curfile) files[curfile].end();
	});
});

module.exports = ArcStream;