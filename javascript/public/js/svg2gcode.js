function svg2gcode(svg, settings) {
  // clean off any preceding whitespace
  svg = svg.replace(/^[\n\r \t]/gm, '');
  settings = settings || {};
  settings.scale = settings.scale || -1;
  settings.cutZ = settings.cutZ || 0; // cut z
  settings.safeZ = settings.safeZ || 90;   // safe z
  settings.feedRate = settings.feedRate || 1400;
  settings.seekRate = settings.seekRate || 1100;
  settings.bitWidth = settings.bitWidth || 1; // in mm

  settings.verticalSlices = settings.verticalSlices || 1;
  settings.horizontalSlices = settings.horizontalSlices || 1;

  settings.offsetX = settings.offsetX || 0;
  settings.offsetY = settings.offsetY || 0;

  var scale = function(val) {
    return val * settings.scale;
  };
  var paths = SVGReader.parse(svg, {}).allcolors,
      gcode,
      path,
      idx = paths.length,
      minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

  while(idx--) {
    var subidx = paths[idx].length;
    var bounds = { x : Infinity , y : Infinity, x2 : -Infinity, y2: -Infinity, area : 0};

    // find lower and upper bounds
    while(subidx--) {
      if (paths[idx][subidx].x < bounds.x)
        bounds.x = paths[idx][subidx].x;
      if (paths[idx][subidx].x < minX)
        minX = paths[idx][subidx].x;

      if (paths[idx][subidx].y < bounds.y)
        bounds.y = paths[idx][subidx].y;
      if (paths[idx][subidx].y < minY)
        minY = paths[idx][subidx].y;

      if (paths[idx][subidx].x > bounds.x2)
        bounds.x2 = paths[idx][subidx].x;
      if (paths[idx][subidx].x > maxX)
        maxX = paths[idx][subidx].x;

      if (paths[idx][subidx].y > bounds.y2)
        bounds.y2 = paths[idx][subidx].y;
      if (paths[idx][subidx].y > maxY)
        maxY = paths[idx][subidx].y;
    }

    // calculate area
    bounds.area = (1 + bounds.x2 - bounds.x) * (1 + bounds.y2-bounds.y);
    paths[idx].bounds = bounds;
  }

  if (settings.verticalSlices > 1 || settings.horizontalSlices > 1) {
    // break the job up into slices, work in small chunks
    var totalWidth = maxX - minX;
    var totalHeight = maxY - minY;
    var columnWidth = totalWidth / settings.verticalSlices;
    var rowHeight = totalHeight / settings.horizontalSlices;
    var sortedPaths = [];
    // create empty data structure
    for (i = 0; i < settings.horizontalSlices; i++) {
      sortedPaths[i] = [];
      for (j = 0; j < settings.verticalSlices; j++) {
        sortedPaths[i][j] = [];
      }
    }
    // populate it with paths
    paths.forEach(function(path) {
      var rowIndex = Math.floor((path[0].y + (totalHeight/2)) / rowHeight);
      var colIndex = Math.floor((path[0].x + (totalWidth/2)) / columnWidth);
      // console.log(rowIndex-2, colIndex-2);
      if (rowIndex < settings.verticalSlices && colIndex < settings.horizontalSlices) {
        sortedPaths[rowIndex][colIndex].push(path);
      } else {
        console.log("warning: skipped path");
      }
    });
    // concatenate all the paths together
    paths = sortedPaths.map(function(row, i) {
      if ((i % 2) == 1) row.reverse();
      return [].concat.apply([], row);
    });
    paths = [].concat.apply([], paths);
  }

  gcode = [
    'G90',
    'G1 Z' + settings.safeZ,
    'G82',
    'M4'
  ];

  for (var pathIdx = 0, pathLength = paths.length; pathIdx < pathLength; pathIdx++) {
    path = paths[pathIdx];

    // seek to index 0
    gcode.push(['G1',
      'X' + scale(path[0].x + settings.offsetX),
      'Y' + scale(path[0].y + settings.offsetY),
      'F' + settings.seekRate
    ].join(' '));


    // begin the cut by dropping the tool to the work
    gcode.push(['G1',
      'Z' + (settings.cutZ),
      'F' + '200'
    ].join(' '));

    // keep track of the current path being cut, as we may need to reverse it
    // var localPath = [];
    for (var segmentIdx=0, segmentLength = path.length; segmentIdx<segmentLength; segmentIdx++) {
      var segment = path[segmentIdx];

      var localSegment = ['G1',
        'X' + scale(segment.x + settings.offsetX),
        'Y' + scale(segment.y + settings.offsetY),
        'F' + settings.feedRate
      ].join(' ');

      // feed through the material
      gcode.push(localSegment);
      // localPath.push(localSegment);

      // if the path is not closed, reverse it, drop to the next cut depth and cut
      // this handles lines
      // if (segmentIdx === segmentLength - 1 && (segment.x !== path[0].x || segment.y !== path[0].y)) {
      //   // begin the cut by dropping the tool to the work
      //   gcode.push(['G1',
      //     'Z' + (settings.cutZ),
      //     'F' + '200'
      //   ].join(' '));
      //   Array.prototype.push.apply(gcode, localPath.reverse());
      // }

    }

    // go safe
    gcode.push(['G1',
      'Z' + settings.safeZ,
      'F' + '300'
    ].join(' '));
  }

  // just wait there for a second
  gcode.push('G4 P1');

  // turn off the spindle
  // gcode.push('M5');

  // go home
  // gcode.push('G1 Z0 F300');
  // 
  gcode.push('G1 Z' + settings.safeZ);
  gcode.push('G1 X0 Y0 F800');

  return gcode.join('\n');
}
