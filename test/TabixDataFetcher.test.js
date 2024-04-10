import { describe, expect, it } from 'vitest';
import TabixDataFetcher from '../src/TabixDataFetcher.js';

describe("Tabix data fetcher tests", () => {
  describe("Tabix data fetcher", () => {
    const df = new TabixDataFetcher(
      {},
      {
        type: "tabix",
        url: "https://areynolds-us-west-2.s3.us-west-2.amazonaws.com/tabix/gencode.v38.annotation.gtf.higlass-transcripts.hgnc.090721.forceHGNC.gz",
        chromSizesUrl: "https://areynolds-us-west-2.s3.amazonaws.com/hg38.meuleman.fixedBin.chrom.sizes",
      }
    );

    it("should fetch the tileset info", () => new Promise((done) => {
      df.tilesetInfo((tsInfo) => {
        expect(tsInfo.tile_size).to.eql(1024);
        expect(tsInfo.max_zoom).to.eql(22);
        done();
      });
    }));

    // it("should fetch a tile", (done) => {
    //   df.fetchTilesDebounced(
    //     (tiles) => {
    //       console.warn(tiles);
    //       expect(tiles).to.include.all.keys("0.0");

    //       expect(tiles["0.0"].length).to.be.above(0);

    //       done();
    //     },
    //     ["0.0"]
    //   );
    // });

    // it("should fetch two tiles", (done) => {
    //   df.fetchTilesDebounced(
    //     (tiles) => {
    //       expect(tiles).to.include.all.keys("1.0", "1.1");

    //       expect(tiles["1.0"].length).to.be.above(0);
    //       expect(tiles["1.1"].length).to.be.above(0);

    //       done();
    //     },
    //     ["1.0", "1.1"]
    //   );
    // });
  });

  
});
