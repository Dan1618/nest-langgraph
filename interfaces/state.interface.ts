export interface SummaryState {
    companies: Company[];
    draft?: string;
}

export interface Company {
    id: string;
    name: string;
    ticker: string;
    description: string;
    risk?: number;
}