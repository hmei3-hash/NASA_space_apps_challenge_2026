// Historical cases shown in the re-planning panel. Each line is a paraphrase of the cited source;
// see docs/RESEARCH.md for the full notes.

export const CASES = {
  dust: {
    title: 'Why act on the warning: Jezero 2022 and Opportunity 2018',
    points: [
      'January 2022: a regional storm reactivated west of Jezero and passed over Perseverance. Its dust front expanded at about 25 m/s, roughly 90 km/h.',
      'At that speed a station 100 km upwind, on the edge of a NASA-style 100 km Exploration Zone, buys about an hour. One 30 km out buys about 20 minutes. A station at the habitat alone gives no warning to a crew west of it.',
      'MEPAG asked for a met package at the landing site and an orbital weather station that can alert surface crews, but agreed on no number or layout for a surface network. An ESA study modelled four landers around candidate human sites.',
      'June 2018: a storm first seen on 30 May grew much faster than the 2007 storm. Opportunity lost contact on 10 June and never answered again.',
      'Forecasting storm onset is still unsolved: there is no known predictor of which local storm will grow.',
      'At planet scale, the 2018 storm went from a patch in Acidalia to the whole planet in about 20 days; its edges moved at 5 to 40 m/s. A base the storm reaches first can warn the others days ahead (open the Globe).',
    ],
    lesson: 'Warnings will be short and late, so the plan must keep a shelter within reach and the crew must move on the first detection.',
    sources: [
      ['Sánchez-Lavega et al. 2025, JGR Planets (front speed 25 m/s)', 'https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2024JE008565'],
      ['Lemmon et al. 2022, GRL (storm over Jezero)', 'https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GL100126'],
      ['NASA JPL: Opportunity hunkers down during dust storm', 'https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/'],
      ['Eos: Opportunity rover mission complete', 'https://eos.org/articles/opportunity-rover-mission-complete'],
      ['Sánchez-Lavega et al. 2019, GRL (2018 storm growth)', 'https://arxiv.org/abs/1906.00963'],
    ],
  },
  sep: {
    title: 'Why re-plan now: solar particle events',
    points: [
      'August 1972: the largest solar particle event of its cycle fell between Apollo 16 and 17. A crew on the Moon would have received a skin dose estimated at 600 rem. They were spared by timing, not by a forecast.',
      '20 May 2024: Curiosity RAD at Gale measured its largest surge since landing, about 8,100 µGy, roughly 30 chest X-rays for a person standing there. Not lethal, but the advice was to take cover.',
      'October 2003: a solar event disabled MARIE on Mars Odyssey, the instrument built to measure exactly this radiation.',
    ],
    lesson: 'Particle events arrive with little warning and can take out sensors too, so the way home should be computed before it is needed.',
    sources: [
      ['NASA: Working on the Moon, radiation (Apollo)', 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html'],
      ['National Academies: Storms from the Sun (2002)', 'https://www.nationalacademies.org/read/10249/chapter/11'],
      ['Phys.org / NASA: Mars lights up during epic solar storm (2024)', 'https://phys.org/news/2024-06-nasa-mars-epic-solar-storm.html'],
      ['JPL archive: MARIE instrument', 'https://webarchive.library.unt.edu/eot2008/20090512094433/http://mars.jpl.nasa.gov/odyssey/technology/marie.html'],
    ],
  },
};
