/**
 * Published sources behind Rotation Explorer's reasons. Every reason cites at least one of these,
 * or a value from the field's own profile or the farmer's answers.
 */
export interface Citation {
  id: CitationId;
  title: string;
  publisher: string;
  url: string;
}

export type CitationId =
  | 'nrcs-340'
  | 'nrcs-328'
  | 'nrcs-329'
  | 'sare-mccp'
  | 'mccc'
  | 'davis-2012'
  | 'gray-2009'
  | 'scn-coalition'
  | 'peltier-2012'
  | 'farooq-2011'
  | 'nass-dates';

export const CITATIONS: Record<CitationId, Citation> = {
  'nrcs-340': {
    id: 'nrcs-340',
    title: 'Conservation Practice Standard 340: Cover Crop',
    publisher: 'USDA NRCS',
    url: 'https://www.nrcs.usda.gov/resources/guides-and-instructions/cover-crop-ac-340-conservation-practice-standard',
  },
  'nrcs-328': {
    id: 'nrcs-328',
    title: 'Conservation Practice Standard 328: Conservation Crop Rotation',
    publisher: 'USDA NRCS',
    url: 'https://www.nrcs.usda.gov/resources/guides-and-instructions/conservation-crop-rotation-ac-328-conservation-practice-standard',
  },
  'nrcs-329': {
    id: 'nrcs-329',
    title: 'Conservation Practice Standard 329: Residue and Tillage Management, No-Till',
    publisher: 'USDA NRCS',
    url: 'https://www.nrcs.usda.gov/resources/guides-and-instructions/residue-and-tillage-management-no-till-ac-329-conservation-practice',
  },
  'sare-mccp': {
    id: 'sare-mccp',
    title: 'Managing Cover Crops Profitably, 3rd edition',
    publisher: 'USDA SARE',
    url: 'https://www.sare.org/resources/managing-cover-crops-profitably-3rd-edition/',
  },
  mccc: {
    id: 'mccc',
    title: 'Cover crop decision tools and species guides',
    publisher: 'Midwest Cover Crops Council',
    url: 'https://midwestcovercrops.org/',
  },
  'davis-2012': {
    id: 'davis-2012',
    title: 'Increasing cropping system diversity balances productivity, profitability and environmental health (Marsden Farm, Iowa)',
    publisher: 'Davis et al., PLOS ONE 7(10): e47149, 2012',
    url: 'https://doi.org/10.1371/journal.pone.0047149',
  },
  'gray-2009': {
    id: 'gray-2009',
    title: 'Adaptation and invasiveness of western corn rootworm: intensifying research on a worsening pest',
    publisher: 'Gray et al., Annual Review of Entomology 54, 2009',
    url: 'https://doi.org/10.1146/annurev.ento.54.110807.090434',
  },
  'scn-coalition': {
    id: 'scn-coalition',
    title: 'Take the test, beat the pest: managing soybean cyst nematode',
    publisher: 'The SCN Coalition (university and checkoff partnership)',
    url: 'https://www.thescncoalition.com/',
  },
  'peltier-2012': {
    id: 'peltier-2012',
    title: 'Biology, yield loss and control of Sclerotinia stem rot of soybean',
    publisher: 'Peltier et al., Journal of Integrated Pest Management 3(2), 2012',
    url: 'https://doi.org/10.1603/IPM11033',
  },
  'farooq-2011': {
    id: 'farooq-2011',
    title: 'Heat stress in wheat during reproductive and grain-filling phases',
    publisher: 'Farooq et al., Critical Reviews in Plant Sciences 30(6), 2011',
    url: 'https://doi.org/10.1080/07352689.2011.615687',
  },
  'nass-dates': {
    id: 'nass-dates',
    title: 'Field Crops Usual Planting and Harvesting Dates (Agricultural Handbook 628)',
    publisher: 'USDA NASS',
    url: 'https://usda.library.cornell.edu/concern/publications/vm40xr56k',
  },
};
