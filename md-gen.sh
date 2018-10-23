#!/usr/bin/env bash
FILE=README.adoc
OUT_FILE=README.md

asciidoctor -b docbook -a leveloffset=+1 -o - $FILE | \
pandoc  --atx-headers --wrap=preserve -t markdown_strict -f docbook - > $OUT_FILE