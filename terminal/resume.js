var os = require('os');
var util = require("util");
var StringDecoder = require('string_decoder').StringDecoder;
var EventEmitter = require("events").EventEmitter;

var stdout = process.stdout;
var stdin = process.stdin;
var stringDecoder = new StringDecoder('utf8');
var functionKeyCodeRegex =
    /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

/**
 * Represents the terminal
 */
function Terminal() {
  EventEmitter.call(this);

  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.on('data', this._onData.bind(this));
  stdin.resume();
}

util.inherits(Terminal, EventEmitter);

Terminal.prototype.clearScreen = function() {
  stdout.write('\033[2J');
  return this;
};

Terminal.prototype._onData = function(data) {
  // A modified and stripped down version of https://github.com/TooTallNate/keypress
  var sequence = stringDecoder.write(data);
  if (sequence) {
    if (Buffer.isBuffer(sequence)) {
      if (sequence[0] > 127 && sequence[1] === undefined) {
        sequence[0] -= 128;
        sequence = '\x1b' + sequence.toString('utf-8');
      } else {
        sequence = sequence.toString('utf-8');
      }
    }

    var key = {
      name: '',
      isControl: false
    };
    var parts;

    if (sequence === '\x1b' || sequence === '\x1b\x1b') {
      key.name = 'escape';
    } else if (sequence <= '\x1a') {
      // ctrl + letter
      key.name = String.fromCharCode(sequence.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
      key.isControl = true;
    } else if (parts = functionKeyCodeRegex.exec(sequence)) {
      // ansi escape sequence

      // reassemble the key code leaving out leading \x1b's,
      // the modifier key bitflag and any meaningless "1;" sequence
      var code = (parts[1] || '') + (parts[2] || '') +
                 (parts[4] || '') + (parts[6] || ''),
          modifier = (parts[3] || parts[5] || 1) - 1;

      // Parse the key modifier
      key.isControl = !!(modifier & 4);

      // Parse the key itself
      switch (code) {
        /* xterm ESC [ letter */
        case '[A': key.name = 'up'; break;
        case '[B': key.name = 'down'; break;
        case '[C': key.name = 'right'; break;
        case '[D': key.name = 'left'; break;

        /* xterm/gnome ESC O letter */
        case 'OA': key.name = 'up'; break;
        case 'OB': key.name = 'down'; break;
        case 'OC': key.name = 'right'; break;
        case 'OD': key.name = 'left'; break;

        /* xterm/rxvt ESC [ number ~ */
        case '[5~': key.name = 'page-up'; break;
        case '[6~': key.name = 'page-down'; break;

        /* putty */
        case '[[5~': key.name = 'page-up'; break;
        case '[[6~': key.name = 'page-down'; break;
      }
    }

    if (key.isControl && key.name === 'c') {
      // Quit the program
      stdin.pause();
    } else {
      /**
       * @event Terminal#keypress
       * @type {Object}
       * @property {boolean} isControl - Indicates whether the 'ctrl' key is pressed
       * @property {String} name - Name of the key pressed
       */
      this.emit('keypress', key);
    }
  }
};

Terminal.prototype.writeLine = function(text) {
  if (text !== undefined) {
    stdout.write(text);
  }
  stdout.write(os.EOL);
  return this;
};

Terminal.prototype.writeBlue = function(text) {
  return this.writeColor(text, '\x1B[34m');
};

Terminal.prototype.writeYellow = function(text) {
  return this.writeColor(text, '\x1B[33m');
}

Terminal.prototype.writeCyan = function(text) {
  return this.writeColor(text, '\x1B[36m');
};

Terminal.prototype.writeGreen = function(text) {
  return this.writeColor(text, '\x1B[32m');
};

/**
 * Writes the {@link text} with the given {@link color}
 */
Terminal.prototype.writeColor = function(text, color) {
  stdout.write(color);
  stdout.write(text);
  stdout.write('\x1B[39m');
  return this;
};

var terminal = new Terminal();
