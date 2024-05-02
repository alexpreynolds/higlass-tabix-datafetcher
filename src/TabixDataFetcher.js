import slugid from "slugid";
import { TabixIndexedFile } from "@gmod/tabix";
import { RemoteFile } from "apr144-generic-filehandle";
import { tsvParseRows } from "d3-dsv";
import { text } from "d3-request";

const chrToAbs = (chrom, chromPos, chromInfo) => {
  return chromInfo.chrPositions[chrom].pos + chromPos;
};

function parseChromsizesRows(data) {
  const cumValues = [];
  const chromLengths = {};
  const chrPositions = {};

  let totalLength = 0;

  for (let i = 0; i < data.length; i++) {
    const length = Number(data[i][1]);
    totalLength += length;

    const newValue = {
      id: i,
      chr: data[i][0],
      pos: totalLength - length,
    };

    cumValues.push(newValue);
    chrPositions[newValue.chr] = newValue;
    chromLengths[data[i][0]] = length;
  }

  return {
    chrToAbs: ([chrName, chrPos]) =>
      chrToAbs(chrName, chrPos, { chrPositions }),
    cumPositions: cumValues,
    chrPositions,
    totalLength,
    chromLengths,
  };
}

function ChromosomeInfo(filepath, success) {
  const ret = {};

  ret.absToChr = (absPos) => (ret.chrPositions ? absToChr(absPos, ret) : null);

  ret.chrToAbs = ([chrName, chrPos] = []) =>
    ret.chrPositions ? chrToAbs(chrName, chrPos, ret) : null;

  return text(filepath, (error, chrInfoText) => {
    if (error) {
      // console.warn('Chromosome info not found at:', filepath);
      if (success) success(null);
    } else {
      const data = tsvParseRows(chrInfoText);
      const chromInfo = parseChromsizesRows(data);

      Object.keys(chromInfo).forEach((key) => {
        ret[key] = chromInfo[key];
      });
      if (success) success(ret);
    }
  });
}

const TabixDataFetcher = function TabixDataFetcher(HGC, ...args) {
  if (!new.target) {
    throw new Error(
      'Uncaught TypeError: Class constructor cannot be invoked without "new"'
    );
  }

  class TabixDataFetcherClass {
    constructor(dataConfig) {
      this.dataConfig = dataConfig;
      this.trackUid = slugid.nice();
      this.tabixFile = null;
      this.TILE_SIZE = 1024;

      this.errorTxt = "";
      this.dataPromises = [];
      this.dataPromises.push(this.loadChromsizes(dataConfig));
      this.dataPromises.push(this.loadTabix(dataConfig));
    }

    loadChromsizes(dataConfig) {
      if (dataConfig.chromSizesUrl) {
        return new Promise((resolve) => {
          ChromosomeInfo(dataConfig.chromSizesUrl, (chromInfo) => {
            this.chromSizes = chromInfo;
            resolve();
          });
        });
      } else {
        console.error(
          'Please enter a "chromSizesUrl" field to the data config'
        );
      }
      return null;
    }

    loadTabix(dataConfig) {
      if (dataConfig.url) {
        this.tabixFile = new TabixIndexedFile({
          filehandle: new RemoteFile(dataConfig.url),
          tbiFilehandle: new RemoteFile(`${dataConfig.url}.tbi`),
        });
        return this.tabixFile;
      } else {
        console.error('Please enter a "url" field to the data config');
        return null;
      }
    }

    tilesetInfo(callback) {
      this.tilesetInfoLoading = true;

      return Promise.all(this.dataPromises)
        .then(() => {
          this.tilesetInfoLoading = false;

          let retVal = {};

          const totalLength = this.chromSizes.totalLength;

          retVal = {
            tile_size: this.TILE_SIZE,
            max_zoom: Math.ceil(
              Math.log(totalLength / this.TILE_SIZE) / Math.log(2)
            ),
            max_width: 2 ** Math.ceil(Math.log(totalLength) / Math.log(2)),
            min_pos: [0],
            max_pos: [totalLength],
          };

          if (callback) {
            callback(retVal);
          }

          return retVal;
        })
        .catch((err) => {
          this.tilesetInfoLoading = false;

          console.error(err);

          if (callback) {
            callback({
              error: `Error parsing tabix: ${err}`,
            });
          }
        });
    }

    async fetchTilesDebounced(receivedTiles, tileIds) {
      const tiles = {};

      const validTileIds = [];
      const tilePromises = [];

      for (const tileId of tileIds) {
        const parts = tileId.split(".");
        const z = parseInt(parts[0], 10);
        const x = parseInt(parts[1], 10);

        if (Number.isNaN(x) || Number.isNaN(z)) {
          console.warn("Invalid tile zoom or position:", z, x);
          continue;
        }
        
        validTileIds.push(tileId);
        tilePromises.push(await this.tile(z, x));
      }

      for (let i = 0; i < tilePromises.length; i++) {
        const validTileId = validTileIds[i];
        tiles[validTileId] = tilePromises[i];
        tiles[validTileId].tilePositionId = validTileId;
      }
      receivedTiles(tiles);

      return tiles;
    }

    tile(z, x) {
      return this.tilesetInfo().then(async (tsInfo) => {
        const tileWidth = +tsInfo.max_width / 2 ** +z;

        const recordPromises = [];

        const tile = {
          tilePos: [x],
          tileId: "tabix." + z + "." + x,
          // tileId: z + "." + x,
          zoomLevel: z,
        };

        // get the bounds of the tile
        const minXOriginal = tsInfo.min_pos[0] + x * tileWidth;
        let minX = minXOriginal;
        const maxX = tsInfo.min_pos[0] + (x + 1) * tileWidth;

        const { chromLengths, cumPositions } = this.chromSizes;
        const tileObjs = [];

        for (let i = 0; i < cumPositions.length; i++) {
          const chromName = cumPositions[i].chr;
          const chromStart = cumPositions[i].pos;
          const chromEnd = cumPositions[i].pos + chromLengths[chromName];

          let startPos, endPos;

          if (chromStart <= minX && minX < chromEnd) {
            // start of the visible region is within this chromosome

            if (maxX > chromEnd) {
              // the visible region extends beyond the end of this chromosome
              // fetch from the start until the end of the chromosome
              startPos = minX - chromStart;
              endPos = chromEnd - chromStart;
              await this.tabixFile.getLines(chromName, startPos, endPos, (line, fileOffset) => {
                const fields = line.split('\t');
                tileObjs.push({
                  xStart: chromStart + parseInt(fields[1], 10),
                  xEnd: chromStart + parseInt(fields[2], 10),
                  chrOffset: chromStart,
                  importance: parseFloat(fields[4], 10),
                  uid: slugid.nice(),
                  fields: fields,
                  transcriptId: `${fields[7]}_${fields[0]}_${fields[1]}_${fields[2]}`,
                });
              });
              minX = chromEnd;
            } else {
              startPos = Math.floor(minX - chromStart);
              endPos = Math.ceil(maxX - chromStart);
              await this.tabixFile.getLines(chromName, startPos, endPos, (line, fileOffset) => {
                const fields = line.split('\t');
                tileObjs.push({
                  xStart: chromStart + parseInt(fields[1], 10),
                  xEnd: chromStart + parseInt(fields[2], 10),
                  chrOffset: chromStart,
                  importance: parseFloat(fields[4], 10),
                  uid: slugid.nice(),
                  fields: fields,
                  transcriptId: `${fields[7]}_${fields[0]}_${fields[1]}_${fields[2]}`,
                });
              });
              break;
            }
          }
        }

        return tileObjs;
      });
    }
  }

  return new TabixDataFetcherClass(...args);
}; // end function wrapper

TabixDataFetcher.config = {
  type: "tabix",
};

export default TabixDataFetcher;
