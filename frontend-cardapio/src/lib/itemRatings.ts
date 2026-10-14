import { fetchItemReviewsSummary } from './customer-api';
import { createItemRatingLoader } from './itemRatingLoader';

export type { ItemRating } from './itemRatingLoader';

// Mesmo endpoint da tela do item (fetchItemReviewsSummary), com cache e deduplicação.
const loader = createItemRatingLoader(fetchItemReviewsSummary);
export const peekItemRating = loader.peek;
export const loadItemRating = loader.load;
