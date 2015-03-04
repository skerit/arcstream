var Blast = __Protoblast,
    Fn = Blast.Bound.Function,
    PassThrough = require('stream').PassThrough,
    ArcBaseFile = require('./base_arc_file'),
    TarFile;

/**
 * File in RAR archive wrapper
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {ArcStream}   parent     The parent archive
 * @param    {String}      filename   The name of the file
 * @param    {Number}      size       The expected filesize
 */
TarFile = Fn.inherits('ArcBaseFile', function ArcTarFile(parent, filename, size) {

	// The expected filesize
	this.size = size;

	ArcBaseFile.call(this, parent, filename);
});
var bytes = 0;
/**
 * Update the streams
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 *
 * @return   {undefined|Buffer}   Return the buffer if it was not needed
 */
TarFile.setMethod(function update(chunk) {

	bytes += chunk.length;

	// Return the chunk if it would make the file too big
	if (this.index + chunk.length > this.size) {
		return chunk;
	}

	this.index += chunk.length;
	this.output.push(chunk);
});

/**
 * Indicate this file should be done,
 * provide a buffer that could possibly still be needed
 *
 * @author   Jelle De Loecker <jelle@kipdola.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}    lastbuf
 *
 * @return   {undefined|Buffer}   Return the buffer if it was not needed
 */
TarFile.setMethod(function end(lastbuf) {

	var that = this,
	    result;

	if (this.ended) {
		return lastbuf;
	}

	if (lastbuf) {
		result = this.update(lastbuf);
	}

	that.ended = true;
	that.output.end();

	return result;
});

module.exports = TarFile;