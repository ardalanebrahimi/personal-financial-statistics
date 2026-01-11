export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category?: string;
  beneficiary?: string; // Add this field
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];
}
