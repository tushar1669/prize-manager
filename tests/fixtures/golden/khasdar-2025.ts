// Golden fixture for Khasdar Chashak 2025 (synthetic, focused on rating bands and main ordering)
import { type TestCategory, type TestPlayer } from '../../allocation/helpers';

export const startDate = new Date('2025-02-01');

export const players: TestPlayer[] = [
  { id: 'k1', name: 'Vedant Patil', rank: 1, rating: 1985, gender: 'M', dob: '2002-03-19', state: 'MH' },
  { id: 'k2', name: 'Saisha Pujari', rank: 2, rating: 1940, gender: 'F', dob: '2003-07-25', state: 'MH' },
  { id: 'k3', name: 'Adit Desai', rank: 3, rating: 1875, gender: 'M', dob: '2005-01-09', state: 'GJ' },
  { id: 'k4', name: 'Reva Chitale', rank: 4, rating: 1820, gender: 'F', dob: '2006-05-30', state: 'MH' },
  { id: 'k5', name: 'Suyash Chavan', rank: 5, rating: 1850, gender: 'M', dob: '2007-04-14', state: 'MH' },
  { id: 'k6', name: 'Dhruv Kulkarni', rank: 6, rating: 1765, gender: 'M', dob: '2007-12-02', state: 'KA' },
  { id: 'k7', name: 'Radhika Iyer', rank: 7, rating: 1710, gender: 'F', dob: '2008-06-18', state: 'TN' },
  { id: 'k8', name: 'Pranav Joshi', rank: 8, rating: 1655, gender: 'M', dob: '2009-09-12', state: 'MH' },
  { id: 'k9', name: 'Niranjan Ghadge', rank: 9, rating: 1595, gender: 'M', dob: '2010-11-01', state: 'MH' },
  { id: 'k10', name: 'Shivangi Kale', rank: 10, rating: 1520, gender: 'F', dob: '2011-10-14', state: 'MH' },
  { id: 'k11', name: 'Yash Tambe', rank: 11, rating: 1460, gender: 'M', dob: '2012-08-07', state: 'MH' },
  { id: 'k12', name: 'Aarya Pawar', rank: 12, rating: 1390, gender: 'F', dob: '2013-04-21', state: 'MH' },
  { id: 'k13', name: 'Omkar Lokhande', rank: 13, rating: 1325, gender: 'M', dob: '2014-01-16', state: 'MH' },
];

const mainPrizes = [
  { id: 'k-main-1', place: 1, cash_amount: 15000 },
  { id: 'k-main-2', place: 2, cash_amount: 12000 },
  { id: 'k-main-3', place: 3, cash_amount: 9000 },
];

const band = (idPrefix: string, min: number, max: number, order_idx: number): TestCategory => ({
  id: `${idPrefix}-${min}-${max}`,
  name: `${min}-${max}`,
  is_main: false,
  order_idx,
  criteria_json: { min_rating: min, max_rating: max },
  prizes: [
    { id: `${idPrefix}-${min}-${max}-1`, place: 1, cash_amount: 6000 },
    { id: `${idPrefix}-${min}-${max}-2`, place: 2, cash_amount: 4000 },
  ],
});

export const categories: TestCategory[] = [
  { id: 'k-main', name: 'Open', is_main: true, order_idx: 0, prizes: mainPrizes },
  band('k-band', 1801, 1900, 1),
  band('k-band', 1601, 1800, 2),
  band('k-band', 1401, 1600, 3),
];

export const totalPrizes = categories.reduce((sum, cat) => sum + cat.prizes.length, 0);
