// @serial: made-up case for check-runner.sh: must run alone, after the parallel batch
// Named 01 so that only its marker, not its place in filename order, can put it last.
const fs = require('fs');
const log = (what) => fs.appendFileSync(process.env.SERIAL_LOG, what + ' 01-serial\n');
log('start');
setTimeout(() => { log('end'); }, 500);
