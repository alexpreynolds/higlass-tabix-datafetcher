#!/usr/bin/env python

import os
import sys
import pysam
import bgzip
import subprocess
import pandas as pd

i_fn = sys.argv[1]
o_fn = sys.argv[2]

if not i_fn:
    raise Exception("Error: Missing input file")
if not o_fn:
    raise Exception("Error: Missing output file")

DEFAULT_IMPORTANCE = 100

df = pd.read_csv(i_fn, delimiter='\t', header=None, comment='#')

# https://useast.ensembl.org/info/website/upload/gff3.html
df.columns = ['seqid', 
              'source', 
              'type',
              'start',
              'end',
              'score',
              'strand',
              'phase',
              'attributes']

transcripts = {}
transcript_ids = []

for index, row in df.iterrows():
    attrs = {a_kv[0]:a_kv[1] for a_kv in [a_kvs.split('=') for a_kvs in row['attributes'].split(';')]}
    if row['type'] == 'transcript':
        transcript_ids.append(attrs['transcript_id'])
        transcripts[attrs['transcript_id']] = {'seqid': row['seqid'],
                                               'txStart': row['start'],
                                               'txEnd': row['end'],
                                               'symbol': attrs['transcript_name'],
                                               'importance': DEFAULT_IMPORTANCE,
                                               'strand': row['strand'],
                                               'ensg': attrs['gene_id'],
                                               'enst': attrs['transcript_id'],
                                               'biotype': attrs['transcript_type'],
                                               'exonStarts': [],
                                               'exonEnds': [],
                                               'cdsStart': '.',
                                               'cdsEnd': '.'}
    elif row['type'] == 'exon':
        transcripts[attrs['transcript_id']]['exonStarts'].append(str(row['start']))
        transcripts[attrs['transcript_id']]['exonEnds'].append(str(row['end']))

o_tmp_unsorted_fn = "{}.tmp_unsorted".format(o_fn)

with open(o_tmp_unsorted_fn, "w") as o_tmp_unsorted_fh:
  for transcript_id in transcript_ids:
      v = transcripts[transcript_id]
      out_data = []
      out_data.append(v['seqid'])
      out_data.append(v['txStart'])
      out_data.append(v['txEnd'])
      out_data.append(v['symbol'])
      out_data.append(v['importance'])
      out_data.append(v['strand'])
      out_data.append(v['ensg'])
      out_data.append(v['enst'])
      out_data.append(v['biotype'])
      out_data.append(','.join(v['exonStarts']))
      out_data.append(','.join(v['exonEnds']))
      out_data.append(v['cdsStart'])
      out_data.append(v['cdsEnd'])
      out_line = '{}\n'.format('\t'.join([str(x) for x in out_data]))
      o_tmp_unsorted_fh.write(out_line)

o_tmp_sorted_fn = "{}.tmp_sorted".format(o_fn)
with open(o_tmp_sorted_fn, "w") as o_tmp_sorted_fh:
    res = subprocess.run(['sort-bed', o_tmp_unsorted_fn], stdout=o_tmp_sorted_fh)
    if res.returncode != 0:
        raise Exception("Error: Could not sort-bed file [{}]".format(o_tmp_unsorted_fn))

o_fn_bgz_fn = o_fn
with open(o_fn_bgz_fn, "wb") as o_fn_bgz:
    with bgzip.BGZipWriter(o_fn_bgz) as o_fn_bgz_fh:
        with open(o_tmp_sorted_fn, "r") as o_tmp_sorted_fh:
            o_fn_bgz_fh.write(o_tmp_sorted_fh.read().encode())

if not os.path.exists(o_fn_bgz_fn):
    raise Exception("Error: Could not create bgzip archive [{}]".format(o_fn_bgz_fn))

o_fn_bgz_tbi_fn = "{}.tbi".format(o_fn_bgz_fn)
if not os.path.exists(o_fn_bgz_tbi_fn):
    pysam.tabix_index(o_fn_bgz_fn, preset="bed")
    if not os.path.exists(o_fn_bgz_tbi_fn):
        raise Exception("Error: Could not create index of bgzip archive [{}]".format(o_fn_bgz_tbi_fn))

# Clean up
os.remove(o_tmp_unsorted_fn)
os.remove(o_tmp_sorted_fn)