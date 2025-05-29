#!/usr/bin/env bash

cp -f assets/queryIdentity_js/generate_witness.js zkit/artifacts/circuits/queryIdentity.circom/queryIdentity_js
cp -f assets/queryIdentity_js/queryIdentity.wasm zkit/artifacts/circuits/queryIdentity.circom/queryIdentity_js
cp -f assets/queryIdentity_js/witness_calculator.js zkit/artifacts/circuits/queryIdentity.circom/queryIdentity_js
cp -f assets/queryIdentity.groth16.vkey.json zkit/artifacts/circuits/queryIdentity.circom
cp -f assets/queryIdentity.groth16.zkey zkit/artifacts/circuits/queryIdentity.circom
