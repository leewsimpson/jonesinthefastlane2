/**
 * "About real financial help" links for the credits (ENG-35): free, non-commercial debt and money guidance. The game
 * is set in one fictional city, so the list covers the largest English-speaking audiences rather than guessing a
 * player's country. Check each link still points at a free service before a release.
 */
export interface HelpLink {
  /** i18n key suffix: `about.help.<id>`. */
  id: string;
  url: string;
}

export const HELP_LINKS: readonly HelpLink[] = [
  { id: 'us', url: 'https://www.consumerfinance.gov/' },
  { id: 'uk', url: 'https://www.moneyhelper.org.uk/' },
  { id: 'au', url: 'https://ndh.org.au/' },
  { id: 'ca', url: 'https://www.canada.ca/en/financial-consumer-agency.html' },
  { id: 'nz', url: 'https://www.moneytalks.co.nz/' },
];
