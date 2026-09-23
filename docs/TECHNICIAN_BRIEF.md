# Apa kiosk - technician brief

## Goal

Install Apa at the gallery entrance on an Android tablet stand.

Requirements:
- loud, clear voice output
- microphone captures one visitor clearly
- cheap and simple
- hard to steal
- stable for daily unattended use

## Recommended hardware

Core:
- Android tablet
- lockable countertop tablet stand, bolted to furniture
- USB-C hub with PD passthrough
- USB audio adapter with separate mic-in and headphone-out
- powered wired speakers
- retro telephone handset
- TRRS headset splitter: 1x female TRRS -> 2x male TRS (mic + headphones)
- tablet charger

Recommended signal design:
- handset used primarily as close-talk microphone
- speakers used as main output for Apa voice
- no Bluetooth audio

## Connection scheme

```text
Tablet USB-C
  -> USB-C hub with PD
      -> charger
      -> USB audio adapter

Handset TRRS
  -> TRRS splitter
      -> mic plug -> USB audio adapter mic input
      -> headphone plug -> optional, normally unused

USB audio adapter headphone output
  -> powered speakers AUX input
```

Preferred mode:
- visitor speaks into handset
- Apa answers through external speakers

Optional mode:
- if needed later, handset speaker can be fed from headphone output through a passive splitter
- do not use Bluetooth speaker

## Physical installation

Stand:
- bolt tablet stand to counter or pedestal
- route all cables inside stand or furniture
- no exposed adapters on public side

Tablet:
- screen facing visitor at chest or head height
- charging locked in permanently
- kiosk mode enabled

Handset:
- mount on cradle
- coiled cable short enough to prevent walking away with it
- handset reachable from one standing position only
- microphone side close to mouth when lifted

Speakers:
- hide inside stand, shelf, or behind front panel openings
- point toward visitor zone, not toward street
- avoid blocking speaker grills with fabric or solid wood
- target distance to visitor: around 0.5 to 1.5 m

## Audio routing rules

- input must come from handset mic, not tablet mic
- output must go to wired speakers, not tablet speaker
- if Android routes output into handset by mistake, change USB audio device or remove handset speaker path from use
- do not rely on mixed device routing with Bluetooth

## Anti-theft / reliability

- use wired speakers only
- hide hub and USB audio adapter inside locked area
- use cable ties or adhesive mounts inside furniture
- block public access to tablet USB-C port
- keep charger and power strip inaccessible
- if possible, add a small UPS or surge-protected power strip

## Installation checklist

1. Tablet powers on and stays charging through hub.
2. Browser opens kiosk URL automatically.
3. Tablet sees USB audio adapter.
4. Handset mic is detected as input.
5. Speakers are detected as output.
6. Apa voice is clearly audible at 1 m.
7. Visitor speech is understood when speaking into handset.
8. No cable can be unplugged from public side.
9. Stand and handset cannot be removed by hand.

## Quick test on site

Test 1 - output:
- ask Apa a preset question
- confirm speech is loud and intelligible from normal visitor position

Test 2 - input:
- speak a short phrase into handset
- confirm transcript is correct

Test 3 - noise:
- repeat while ambient noise is present
- confirm tablet mic is not being used

Test 4 - restart:
- unplug and restore power
- confirm system returns to kiosk automatically

## Notes for technician

- cheapest stable setup is wired throughout
- avoid Bluetooth speakers
- avoid using tablet built-in mic and speaker
- handset as close-talk mic is the main quality upgrade
