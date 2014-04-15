'use strict';

var os = require('os');
var util = require("util");
var StringDecoder = require('string_decoder').StringDecoder;
var EventEmitter = require("events").EventEmitter;
var inherits = util.inherits;
var EOL = os.EOL;
var stdin = process.stdin;
var stdout = process.stdout;
var stringDecoder = new StringDecoder('utf8');
var functionKeyCodeRegex =
  /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

/**
 * Whether {@link object} is a {@link String}
 */
function isString(object) { return Object.prototype.toString.call(object) === '[object String]'; }

/**
 * Create a new type with the given {@link traits} and {@link baseType}
 */
function newType(constructor, traits, baseType) {
  if (baseType) {
    inherits(constructor, baseType);
  }

  if (traits) {
    var typePrototype = constructor.prototype;
    traits.forEach(function(trait) {
      Object.getOwnPropertyNames(trait).forEach(function(name) {
        typePrototype[name] = trait[name];
      });
    });
  }

  return constructor;
}

/**
 * Thrown when user calls an abstract method
 * @class
 */
var MethodNotImplementedError = newType(function(name) {
  this.name = name;
}, [], Error);

/**
 * Defines an abstract method
 */
function newAbstractMethod(name) {
  return function() {
    throw new MethodNotImplementedError(name);
  };
}

var Iterable = {
  forEach: newAbstractMethod('Iterable#forEach'),
  foldLeft: function(base, accumulator) {
    var result = base;
    this.forEach(function(element) {
      result = accumulator(result, element);
    });
    return result;
  }
};

var Range = newType(function (start, end) {
  this.start = start;
  this.end = end;
}, [Iterable]);

Range.prototype.forEach = function(callback) {
  for (var i = this.start, end = this.end; i < end; i++) {
    callback(i);
  }
};

/**
 * Represents raw terminal stream
 * @class
 */
var RawInputStream = newType(function() {
  this.events = new EventEmitter();
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.on('data', this._onData.bind(this));
  stdin.resume();
});

RawInputStream.prototype._onData = function(data) {
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

    /**
     * @event Terminal#keypress
     * @type {Object}
     * @property {boolean} isControl - Indicates whether the 'ctrl' key is pressed
     * @property {String} name - Name of the key pressed
     */
    this.events.emit('keypress', key);
  }
};

function ResumePrinter() {
  // Make sure line wrap is disabled
  stdout.write('\u001b[7l');
  // Set the background color to black
  stdout.write('\u001b[40m');
}

ResumePrinter.prototype.reset = function() {
  return this.write('\u001b[0m').clearScreen();
};

ResumePrinter.prototype.clearScreen = function() {
  return this
    .write('\u001b[2J')
    .write('\u001b[H');
};

ResumePrinter.prototype.write = function(text) {
  stdout.write(text);
  return this;
};

ResumePrinter.prototype.writeLine = function(text) {
  if (text !== undefined) {
    this.write(text);
  }
  return this.write(os.EOL);
};


ResumePrinter.prototype.printFormattedText = function(text, color) {
  if (text.formattedText) {
    // It's a {@link FormattedText}
    this.write(text.formattedText());
  } else if (isString(text)) {
    // It's a regular {@link String}
    this.write(text);
  }
  return this;
};

ResumePrinter.prototype.printFormattedLine = function(line, color) {
  for (var i = 0, count = line.length; i < count; i++) {
    this.printFormattedText(line[i], color);
  }
  return this.write(EOL);
}

ResumePrinter.prototype._createLine = function(result, _) {
  result.push(yellowText('-'));
  return result;
}

ResumePrinter.prototype.printScreen = function(startIndex, lines) {
  var self = this;
  var separator = new Range(0, stdout.columns / 2).foldLeft([], this._createLine);

  var header = [
    separator,
    [' ', yellowText('Name:'), '         ShengMin Zhang'],
    [' ', greenText('Email:'), '        me@shengmin.me'],
    [' ', cyanText('GitHub:'), '       https://github.com/shengmin'],
    [' ', magentaText('HackerRank:'), '   https://www.hackerrank.com/shengmin'],
    separator
  ];

  header.forEach(function(line) {
    self.printFormattedLine(line);
  });

  var lastLineYear = -1;
  var rowCount = stdout.rows - 1 - header.length;
  var lineCount = lines.length;
  for (var i = startIndex, j = 0; j < rowCount && i < lineCount; i++, j++) {
    var item = lines[i];
    var line = item.line;
    var year = item.year;
    var color = TEXT_COLORS[year % TEXT_COLORS.length];

    if (line instanceof HorizontalLine) {
      line = separator;
    }

    if (year != lastLineYear) {
      line = [' ', underlineText(boldText(color(item.year))), ' ', boldText(color('\u2502')), ' '].concat(line);
      lastLineYear = year;
    } else {
      line = ['      ', boldText(color('\u2502')), ' '].concat(line);
    }

    this.printFormattedLine(line, color);
  }
}

/**
 * Represents formatted text
 * @class
 */
function FormattedText(text, on, off) {
  this.text = text;
  this.on = on;
  this.off = off;
}

/**
 * Returns the formatted text to be written to the standard output
 */
FormattedText.prototype.formattedText = function() { return this.on + this.text + this.off; };
FormattedText.prototype.toString = function() { return this.formattedText(); };

function HorizontalLine() {}

// Factory methods for creating text with different color
function colorText(text, color) { return new FormattedText(text, color, '\u001b[39m'); }
function greenText(text) { return colorText(text, '\u001b[32m'); }
function cyanText(text) { return colorText(text, '\u001b[36m'); }
function yellowText(text) { return colorText(text, '\u001b[33m'); }
function magentaText(text) { return colorText(text, '\u001b[35m'); }
function boldText(text) { return new FormattedText(text, '\u001b[1m', '\u001b[22m'); }
function underlineText(text) { return new FormattedText(text, '\u001b[4m', '\u001b[24m'); };
function keyword(text) { return boldText(greenText(text)); }
function indent(count) {
  return new Range(0, count).foldLeft('', function(result, _) {
    return result + ' ';
  });
}
var HORIZONTAL_LINE = new HorizontalLine();
var TEXT_COLORS = [ yellowText, greenText, cyanText, magentaText ];

var resume = [
  {
    year: 2005,
    story: [
      [],
      ['This is the year where my CS "career" took off'],
      [],
      ['I started'],
      [' - building ', keyword('websites')],
      [' - learning ', keyword('HTML')],
      [' - learning ', keyword('CSS')],
      [],
      ['The first website I have ever built is still live:'],
      [indent(2), yellowText('http://yuss06.150m.com/others_htm/inside_index.htm')],
      []
    ]
  },
  {
    year: 2007,
    story: [
      HORIZONTAL_LINE,
      [],
      ['Then I realized HTML alone is not enough'],
      ['  for building complex websites'],
      [],
      ['I started programming in ', keyword('JavaScript')],
      [' - Expert knowledge and experience'],
      [' - With ', keyword('Node.js'), ' it became my primary scripting language'],
      [],
      ['I started programming in ', keyword('C#')],
      [' - The first programming language I have mastered'],
      [' - Expert knowledge and experience'],
      [],
      ['I started '],
      [' - developing ', keyword('ASP.NET'), ' applications'],
      [' - learning ', keyword('SQL')],
      [' - using ', keyword('jQuery')],
      [' - using ', keyword('Visual Studio')],
      []
    ]
  },
  {
    year: 2009,
    story: [
      HORIZONTAL_LINE,
      [],
      ['I started studying ', keyword('Computer Science'), ' at ', keyword('University of Waterloo')],
      [],
      ['I started programming in ', keyword('Java')],
      [' - It became my primary language for algorithm contests'],
      [' - Expert knowledge and experience'],
      [],
      ['I started'],
      [' - learning ', keyword('C/C++')],
      [' - learning ', keyword('Scheme')],
      [' - using ', keyword('Eclipse')],
      []
    ]
  },
  {
    year: 2010,
    story: [
      HORIZONTAL_LINE,
      [],
      ['I started learning ', keyword('algorithms'), ' and ', keyword('data structures')],
      ['  and competing in algorithm contests'],
      [],
      ['I achieved '],
      [' - ', keyword('11th'), ' place at ', keyword('UW local ACM programming contest')],
      [' - ', keyword('3rd'), ' place at ', keyword('WL compiler optimization contest')],
      [],
      ['I landed my first internship at ', keyword('Roadpost')],
      [' - I gained experience with ', keyword('VB.NET'), ' and ', keyword('ExtJS')],
      [],
      ['I started'],
      [' - learning ', keyword('shell scripting')],
      [' - using ', keyword('Apache Ant')],
      [' - using ', keyword('Git')],
      [' - working with ', keyword('Unix-like system')],
      []
    ]
  },
  {
    year: 2011,
    story: [
      HORIZONTAL_LINE,
      [],
      ['I achieved ', keyword('6th'), ' place at ', keyword('UW local ACM programming contest')],
      [],
      ['I interned at ', keyword('NexJ')],
      [' - I helped maintain their CRM framework'],
      [' - I gained extensive debugging skills'],
      [],
      ['I landed my first internship in the States with ', keyword('Oracle')],
      [' - I developed a SQL-like query editor with intellisense support'],
      ['   that runs in browswer'],
      [],
      ['I started'],
      [' - using ', keyword('Google App Engine'), ' to host my personal website'],
      [' - competing on ', keyword('HackerRank'), ' where now I have ', keyword('O(1) ranking (top 1%)')],
      []
    ]
  },
  {
    year: 2012,
    story: [
      HORIZONTAL_LINE,
      [],
      ['I achieved ', keyword('12th'), ' place at ', keyword('UW local ACM programming contest')],
      [],
      ['I finally landed an internship with ', keyword('Google')],
      [' - I developed infinite scroll for GWT cell table'],
      [' - I gained experience with ', keyword('GWT')],
      [],
      ['I started using ', keyword('IntelliJ')],
      [' - it became my primary IDE'],
      [],
      ['I started programming in ', keyword('Scala')],
      [' - it became my favorite system programming language'],
      [' - strong knowledge and experience'],
      [],
      ['I took ', keyword('CS 442: Principles of Programming Languages')],
      [' - I gained a lot of experience with functional programming'],
      []
    ]
  },
  {
    year: 2013,
    story: [
      HORIZONTAL_LINE,
      [],
      ['I interned at ', keyword('Facebook')],
      [' - I developed UI components for fitness collection'],
      [' - I was lucky enough to be selected to present'],
      ['   my Hackathon project to Zuck in person'],
      [],
      ['I co-founded ', keyword('DaiGouGe')],
      [' - a business that helps oversea customers to purchase and'],
      ['   have products directly shipped to them from taobao.com'],
      [' - we were one of the ', keyword('VeloCity'), ' Demo Day finalists'],
      [],
      ['I landed my last internship at ', keyword('Microsoft')],
      [' - I helped integrate a data source into Bing search result page'],
      [' - I gained experience with ', keyword('TypeScript')],
      [],
      ['I started developing on ', keyword('Node.js')],
      []
    ]
  },
  {
    year: 2014,
    story: [
      HORIZONTAL_LINE,
      [],
      ['This is the year I\'m graduating'],
      [],
      ['I took ', keyword('CS 444: Compiler Construction')],
      [' - I gained a lot of working experience with ', keyword('Scala')],
      [],
      ['I started using ', keyword('Dart')],
      []
    ]
  }
];

// main
(function() {
  var input = new RawInputStream();
  var printer =
    new ResumePrinter().clearScreen();

  var prologue = [
    'Hi, I\'m ShengMin\'s assistant. You are reading his terminal version of resume.',
    'Please remember the following control keys:',
    '\u001b[32mScroll down\u001b[39m: \u001b[33m<Down>\u001b[39m',
    '\u001b[32mScroll up\u001b[39m: \u001b[33m<Up>\u001b[39m',
    '\u001b[32mQuit\u001b[39m: \u001b[33m<Ctrl>\u001b[39m + \u001b[33mc\u001b[39m',
    'Press \u001b[33m<Enter>\u001b[39m to start'
  ].join(os.EOL);

  // Converts the resume to format suitable for {@link ResumePrinter}
  function toLines(resume) {
    var lines = [];

    for (var i = 0, count = resume.length; i < count; i++) {
      var item = resume[i];
      var year = item.year;
      var highlights = item.story;
      for (var j = 0, highlighCount = highlights.length; j < highlighCount; j++) {
        lines.push({ year: year, line: highlights[j] });
      }
    }

    return lines;
  }

  var resumeLines = toLines(resume);

  // Print prologue
  (function() {
    var index = 0;
    var print = function() {
      if (index === prologue.length) {
        // Done printing prologue, wait for user to press <Enter>
        clearInterval(timer);
        input.events.on('keypress', onEnterPressed);
      } else {
        printer.write(prologue[index++]);
      }
    };

    var timer = setInterval(print, 50);
  })();

  function onEnterPressed(key) {
    if (key.isControl && key.name === 'c') {
        // Quit the program
        input.events.removeAllListeners();
        printer.reset();
        stdin.pause();
    } else if (key.name === 'return' || key.name === 'line-feed') {
      // User has pressed <Enter>, start outputing the resume
      input.events.removeListener('keypress', onEnterPressed);
      printer.clearScreen();
      printer.printScreen(0, resumeLines);
      input.events.on('keypress', onKeyPressed);
    }
  }


  var onKeyPressed = (function() {
    var startIndex = 0;

    return function(key) {
      if (key.isControl && key.name === 'c') {
        // Quit the program
        input.events.removeAllListeners();
        printer.reset();
        stdin.pause();
      } else  if (key.name === 'up') {
        if (startIndex > 0) {
          startIndex--;
          printer.clearScreen();
          printer.printScreen(startIndex, resumeLines);
        }
      } else if (key.name === 'down') {
        if (startIndex < resumeLines.length - 1) {
          startIndex++;
          printer.clearScreen();
          printer.printScreen(startIndex, resumeLines);
        } else {
          printer.reset();
          stdin.pause();
        }
      }
    }
  })();

})();
