# Icons

Tauri looks up icons from this directory. During Phase A we copy the repo's
root `logo.png` into the three PNG sizes listed in `tauri.conf.json`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`

Phase F adds a real `.icns` generated from a 1024×1024 master via `iconutil`
along with signed/notarized bundle configuration.
