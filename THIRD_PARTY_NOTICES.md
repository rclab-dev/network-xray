# Third-party notices

The MIT license in [LICENSE](./LICENSE) covers the X-Ray engine and templates. The optional
interactive graph variant (`xray-graph-nextui.html`) additionally bundles the NeXt UI Toolkit,
which is licensed separately:

```
NeXt UI Toolkit (OpenDaylight)
  Files:    js/next.js, css/next.css, css/tailwind.css, fonts/next-font.*,
            fonts/ciscosans*-webfont.*
            (copies also under demo/q21-bgp-lp/js/, css/ and fonts/)
  Copyright (c) The Eclipse Foundation and others
  License:  Eclipse Public License, Version 1.0 (EPL-1.0)
  Full text: js/NeXt-UI-LICENSE  (also at https://www.eclipse.org/legal/epl-v10.html)
  Upstream: https://github.com/CiscoDevNet/NeXt
```

These NeXt UI files are used unmodified and are required only by the opt-in
`xray-graph-nextui.html` variant. The default template (`xray-graph.html`) does not
use them and remains MIT-only with no third-party runtime dependencies.
