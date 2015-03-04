# Arcstream

Arcstream streams the content of archive files while extracting them.

## Install

```bash
$ npm install arcstream
```

## Supported archive types

* RAR
* TAR
* TGZ / TAR.GZ
* BZ2 / TAR.BZ2

## Examples

### Extracting a multipart rar file

```javascript
var ArcStream = require('arcstream'),
    archive = new ArcStream(),
    fs = require('fs');

// You can add only 1 or multiple files
archive.addFile(0, '/my/archive.part1.rar');
archive.addFile(1, '/my/archive.part2.rar');
archive.addFile(2, '/my/archive.part3.rar');
archive.addFile(3, '/my/archive.part4.rar');

archive.on('file', function onFile(filename, stream) {
    stream.pipe(fs.createWriteStream('/tmp/' + filename));
});
```

### Extracting a tar file

```javascript
var ArcStream = require('arcstream'),
    archive = new ArcStream(),
    fs = require('fs');

// Tar only allows 1 file
archive.addFile('/my/archive.tgz');

archive.on('file', function onFile(filename, stream) {
    stream.pipe(fs.createWriteStream('/tmp/' + filename));
});
```
