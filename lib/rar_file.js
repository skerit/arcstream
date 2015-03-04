var Blast = __Protoblast,
    Fn = Blast.Bound.Function,
    PassThrough = require('stream').PassThrough,
    ArcBaseFile = require('./base_arc_file'),
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
RarFile = Fn.inherits('ArcBaseFile', function ArcRarFile(parent, filename) {
	ArcBaseFile.call(this, parent, filename);
});

module.exports = RarFile;