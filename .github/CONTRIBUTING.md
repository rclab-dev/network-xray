# Contributing

Issues are welcome, and fixes are made in this repository.
Pull requests are not merged: the project keeps a single copyright holder. Forks are welcome.

A bug report one maintainer can act on has:

- the network-xray version: the image tag or digest, or the commit (`git rev-parse --short HEAD`) if you run from a clone;
- how it was started: the `docker run …` line, the `./xray.sh …` line, or the netlab `tools:` part;
- the device type and OS version of the routers involved;
- the raw output of the show commands involved, as printed (remove passwords, keys and anything else you do not want public);
- a screenshot of the page.

When a supported router's output is read wrong, use the "Device output not understood" form and say what the device really meant.
Please do not attach `network-xray.json` (netlab writes it; it holds the lab's passwords).
