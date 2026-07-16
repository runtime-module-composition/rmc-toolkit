// At runtime "@esm.sh/react" is fetched from the esm.sh CDN; for
// type-checking, map it to the local React type definitions.
declare module "@esm.sh/react" {
  import React = require("react");
  export = React;
}
