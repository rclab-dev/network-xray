# Contributing

Issues and ideas are welcome, and fixes are made in this repository; the release notes name the person who opened the issue (unless they'd rather not be named).
Pull requests are not merged, because the code keeps a single author so the license stays simple; a pull request is still a fine way to show an idea. Forks are welcome.

A bug report one maintainer can act on has:

- the network-xray version: the image tag or digest, or the commit (`git rev-parse --short HEAD`) if you run from a clone;
- how it was started: the `docker run …` line, the `./xray.sh …` line, or the netlab `tools:` part;
- the device type and OS version of the routers involved;
- the raw output of the show commands involved, as printed (remove passwords, keys and anything else you do not want public);
- a screenshot of the page.

When a supported router's output is read wrong, use the "Device output not understood" form and say what the device really meant.
Please do not attach `network-xray.json` (netlab writes it; it holds the lab's passwords).
