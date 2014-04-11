'use strict';

var os = require('os');
var util = require("util");
var StringDecoder = require('string_decoder').StringDecoder;
var EventEmitter = require("events").EventEmitter;

var inherits = util.inherits;
var EOL = os.EOL;
var stdin = process.stdin;
var stdout = process.stdout;

/**
 * Thrown when user calls an abstract method
 * @class
 */
function MethodNotImplementedError(name) {
  this.name = name;
}

inherits(MethodNotImplementedError, Error);

function newAbstractMethod(name) {
  return function() {
    throw new MethodNotImplementedError(name);
  };
}

function isString(object) { return Object.prototype.toString.call(object) === '[object String]'; }

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
  return this
    .write('\u001b[2J')
    .write('\u001b[H');
};

Terminal.prototype._stringDecoder = new StringDecoder('utf8');
Terminal.prototype._functionKeyCodeRegex =
  /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

Terminal.prototype._onData = function(data) {
  // A modified and stripped down version of https://github.com/TooTallNate/keypress
  var sequence = this._stringDecoder.write(data);
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

    if (sequence === '\r') {
      key.name = 'return';
    } else if (sequence === '\n') {
      key.name = 'line-feed';
    } else if (sequence === '\x1b' || sequence === '\x1b\x1b') {
      key.name = 'escape';
    } else if (sequence <= '\x1a') {
      // ctrl + letter
      key.name = String.fromCharCode(sequence.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
      key.isControl = true;
    } else if (parts = this._functionKeyCodeRegex.exec(sequence)) {
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
      this.removeAllListeners();
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

Terminal.prototype.write = function(text) {
  stdout.write(text);
  return this;
}

Terminal.prototype.writeLine = function(text) {
  if (text !== undefined) {
    this.write(text);
  }
  return this.write(os.EOL);
};

Terminal.prototype.writeBlue = function(text) {
  return this.writeColor(text, '\u001b[34m');
};

Terminal.prototype.writeYellow = function(text) {
  return this.writeColor(text, '\u001b[33m');
}

Terminal.prototype.writeCyan = function(text) {
  return this.writeColor(text, '\u001b[36m');
};

Terminal.prototype.writeGreen = function(text) {
  return this.writeColor(text, '\u001b[32m');
};

/**
 * Writes the {@link text} with the given {@link color}
 */
Terminal.prototype.writeColor = function(text, color) {
  return this
    .write(color)
    .write(text)
    .write('\u001b[39m');
};


/**
 * Represents formatted text
 * @class
 * @abstract
 */
function FormattedText(text) {
  this.text = text;
}

/**
 * Returns the formatted text to be written to the standard output
 */
FormattedText.prototype.formattedText = newAbstractMethod('FormattedText.formattedText');
FormattedText.prototype.toString = function() { return this.formattedText(); };

/**
 * Represents text with color
 * @class
 */
function ColoredText(text, color) {
  FormattedText.call(this, text);
  this.color = color;
}

inherits(ColoredText, FormattedText);

ColoredText.prototype.formattedText = function() { return this.color + this.text + '\u001b[39m'; };

// Factory methods for creating text with different color
function greenText(text) { return new ColoredText(text, '\u001b[32m'); }
function cyanText(text) { return new ColoredText(text, '\u001b[36m'); }
function blueText(text) { return new ColoredText(text, '\u001b[34m'); }
function yellowText(text) { return new ColoredText(text, '\u001b[33m'); }


function printFormattedText(text) {
  if (text.formattedText) {
    // It's a {@link FormattedText}
    stdout.write(text.formattedText());
  } else if (isString(text)) {
    // It's a regular {@link String}
    stdout.write(text);
  }
}

function printFormattedLine(line) {
  for (var i = 0, count = line.length; i < count; i++) {
    printFormattedText(line[i]);
  }
  stdout.write(EOL);
}

function printFormattedLines(lines) {
  for (var i = 0, lineCount = lines.length; i < lineCount; i++) {
    var line = lines[i];
    for (var j = 0, segmentCount = line.length; j < segmentCount; j++) {
      printFormattedText(line[j]);
    }
    stdout.write(EOL);
  }
}


var r = [
  { year: 2005, line: ['abcedefg'] }
];

for (var i = 2005; i <= 2014; i++) {
  for (var j = 0; j < 30; j++) {
    r.push({ year: i, line: [i + ' abcdefghijklmn ' + j] });
  }
}

(function() {
  var terminal = new Terminal();
  // Print prologue
  var prologue = [
    // 'Hi, you are reading \u001b[36mShengMin\u001b[39m\'s interactive resume.',
    // 'Please remember the following control keys:',
    // '\u001b[32mScroll down\u001b[39m: \u001b[33m<Down>\u001b[39m or \u001b[33m<Right>\u001b[39m',
    // '\u001b[32mScroll up\u001b[39m: \u001b[33m<Up>\u001b[39m or \u001b[33m<Left>\u001b[39m',
    // '\u001b[32mQuit\u001b[39m: \u001b[33m<Ctrl>\u001b[39m + \u001b[33mc\u001b[39m',
    // 'Press \u001b[33m<Enter>\u001b[39m to start'
  ].join(os.EOL);

  var prologueIndex = 0;
  function printPrologue() {
    if (prologueIndex === prologue.length) {
      // Done printing prologue, wait for user to press <Enter>
      clearInterval(prologueTimer);
      terminal.on('keypress', onEnterPressed);
    } else {
      terminal.write(prologue.charAt(prologueIndex++));
    }
  }

  var prologueTimer = setInterval(printPrologue, 50);

  function onEnterPressed(key) {
    if (key.name === 'return' || key.name === 'line-feed') {
      // User has pressed <Enter>, start outputing the resume
      terminal.removeListener('keypress', onEnterPressed);
      terminal.clearScreen();
      printScreen(0);
      terminal.on('keypress', onKeyPressed);
    }
  }

  var startIndex = 0;
  var terminalRowCount = stdout.rows - 1;

  function onKeyPressed(key) {
    if (key.name === 'up') {
      if (startIndex > 0) {
        startIndex--;
        terminal.clearScreen();
        printScreen(startIndex);
      }
    } else if (key.name === 'down') {
      if (startIndex + terminalRowCount < r.length) {
        startIndex++;
        terminal.clearScreen();
        printScreen(startIndex);
      }
    }
  }
})();

var colors = [yellowText, greenText, cyanText, blueText, cyanText, greenText];
function printScreen(startIndex) {
  var lastLineYear = -1;
  for (var i = startIndex, j = 0; j < stdout.rows - 1 && i < r.length; i++, j++) {
    var item = r[i];
    var line = item.line;
    var year = item.year;
    var color = colors[year % colors.length];
    if (year != lastLineYear) {
      line = [' ', color(item.year), ' ', color('|')].concat(line);
      lastLineYear = year;
    } else {
      line = ['      ', color('|')].concat(line);
    }
    printFormattedLine(line);
  }
}


var resume = [
  {
    year: 2005,
    highlights: [
      ['abcdefghijklmnopq'],
      ['dfdfadfadfdafdfdfd'],
      ['adfdfdfdfdfdfdf']
    ]
  }
];

for (var i = 2005; i <= 2014; i++) {
  var highlights = [];
  resume.push({
    year: i,
    highlights: highlights
  });

  for (var j = 0; j < 10; j++) {
    highlights.push('dddddddddddddddddddddddddddddddddddddddddddddddfafdfdfdfd')
  }
}
