const browserCompat = require('@mdn/browser-compat-data');

const browsersToConsider = [
  'chrome',
  'edge',
  'firefox',
  'safari_ios',
  'safari',
];

const releasesCache = {};
// Returns newest first.
function sortBrowserReleasesByReleaseDate(browser) {
  if (releasesCache[browser]) return releasesCache[browser];

  const releases = browserCompat.browsers[browser].releases;
  const asArray = Object.entries(releases).map(entry => ({ version: entry[0], details: entry[1] }));
  releasesCache[browser] = asArray.sort((a, b) => new Date(b.details.release_date) - new Date(a.details.release_date));
  return asArray;
}

/**
 * Stable.
 * @param {Date} month
 */
function findBrowsersReleasedInMonth(month) {
  const result = [];

  for (const browser of Object.keys(browserCompat.browsers)) {
    if (!browsersToConsider.includes(browser)) continue;

    // To simplify, only consider the latest version from each browser.
    const releaseEntry = sortBrowserReleasesByReleaseDate(browser).find(({ version, details }) => {
      if (!details.release_date) return false;

      const releaseDate = new Date(details.release_date);
      return releaseDate.getYear() === month.getYear() && releaseDate.getMonth() === month.getMonth();
    });
    if (!releaseEntry) continue;

    result.push({
      browser,
      version: releaseEntry.version,
    });
  }

  return result;
}

/**
 * @param {Date} month
 */
function findStableBrowsersInMonth(month) {
  const result = [];

  for (const browser of Object.keys(browserCompat.browsers)) {
    if (!browsersToConsider.includes(browser)) continue;

    const releaseEntries = sortBrowserReleasesByReleaseDate(browser).filter(({ details }) => {
      if (!details.release_date) return false;

      const releaseDate = new Date(details.release_date);
      return month.getYear() > releaseDate.getYear() || (month.getYear() === releaseDate.getYear() && month.getMonth() > releaseDate.getMonth());
    });
    const releaseEntry = releaseEntries[0];
    if (!releaseEntry) continue;

    result.push({
      browser,
      version: releaseEntry.version,
    });
  }

  return result;
}

function findBrowserVersionReleaseIndex(browser, version) {
  const releases = sortBrowserReleasesByReleaseDate(browser);
  return releases.findIndex(release => release.version === version);
}

const compatData = getCompatData();
function getCompatData() {
  let compats = [];

  function findCompats(obj, path = []) {
    if (!(typeof obj === 'object' && obj)) return;

    for (const [key, child] of Object.entries(obj)) {
      if (child.__compat) {
        compats.push({
          id: [...path, key].join('.'),
          compat: child.__compat,
        });
      } else {
        findCompats(child, [...path, key]);
      }
    }
  }

  const { browser, ...rootCompatObj } = browserCompat;
  findCompats(rootCompatObj);
  return compats;
}

function getFeatureSetForBrowserVersion({ browser, version }) {
  const features = [];

  for (const feature of compatData) {
    if (!feature.compat.support[browser]) continue;

    const supportStatement = Array.isArray(feature.compat.support[browser]) ?
      feature.compat.support[browser][0] :
      feature.compat.support[browser];
    if (!supportStatement.version_added) continue;
    if (supportStatement.version_removed) continue;
    if (supportStatement.flags) continue;

    const isSupported = supportStatement.version_added === true ||
      findBrowserVersionReleaseIndex(browser, version) <= findBrowserVersionReleaseIndex(browser, supportStatement.version_added);
    if (isSupported) {
      if (supportStatement.flags) console.log(feature.id, supportStatement);
      features.push(feature.id);
    }
  }

  return new Set(features);
}

function getFeatureSetForBrowserVersions(browserVerisons) {
  return setIntersections(...browserVerisons.map(getFeatureSetForBrowserVersion));
}

function setIntersections(...sets) {
  const result = new Set();
  const [firstSet, ...rest] = sets;

  for (const item of firstSet) {
    if (rest.every(set => set.has(item))) {
      result.add(item);
    }
  }

  return result;
}

function setDifference(a, b) {
  const result = new Set();

  for (const item of a) {
    if (b.has(item)) continue;
    result.add(item);
  }
  for (const item of b) {
    if (a.has(item)) continue;
    result.add(item);
  }

  return result;
}

function yearInReview(year) {
  const twoMonthsFromToday = new Date(new Date() - -1000 * 60 * 60 * 24 * 30 * 3);
  console.log(`\n# ${year}\n\n`);
  for (let i = 12; i >= 1; i--) {
    const lastMonth = new Date(i === 1 ? `${year - 1}/12/01` : `${year}/${i - 1}/01`);
    const thisMonth = new Date(`${year}/${i}/01`);
    if (thisMonth > twoMonthsFromToday) continue;
    const newReleases = findBrowsersReleasedInMonth(new Date(thisMonth));
    const lastMonthStableBrowsers = findStableBrowsersInMonth(lastMonth);
    const thisMonthStableBrowsers = findStableBrowsersInMonth(thisMonth);
    const lastMonthFeatureSet = getFeatureSetForBrowserVersions(lastMonthStableBrowsers);
    const thisMonthFeatureSet = getFeatureSetForBrowserVersions(thisMonthStableBrowsers);
    const difference = setDifference(lastMonthFeatureSet, thisMonthFeatureSet);

    console.log(`\n## ${thisMonth.toLocaleString('en-us', { month: 'short', year: 'numeric' })}`);
    newReleases.length && console.log(`### Browsers released:\n`, 
      '  - ' + newReleases.map(r => JSON.stringify(r).replace(/"/g, `'`)).join('\n  - '));
    difference.size && console.log(`### These Features became stable across all major browsers:\n`, 
      '  - ' + Array.from(difference).map(f => '`' + f + '`').join('\n  - '));
  }
  console.log('\n');
}

for (let year = 2023; year >= 2018; year--) {
  yearInReview(year);
}

// console.log(getFeatureSetForBrowserVersion({ browser: 'safari', version: '15.1' }).has('api.AudioWorkletNode'));
// console.log(browserCompat.api.AudioWorkletNode.__compat.support);
