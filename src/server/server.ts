// @ts-ignore
const express = require('express');
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import cors from 'cors';
import { Request, Response } from 'express';

const app = express();
app.use(express.json());
app.use(cors());

const CATEGORIES_FILE = join(__dirname, '../assets/categories.json');
const TRANSACTIONS_FILE = join(__dirname, '../assets/transactions.json');

interface StoredTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  timestamp: string;
}

async function getStoredTransactions(): Promise<StoredTransaction[]> {
  try {
    const data = await readFile(TRANSACTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveTransaction(transaction: StoredTransaction) {
  const transactions = await getStoredTransactions();
  transactions.push({
    ...transaction,
    timestamp: new Date().toISOString()
  });
  await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
}

app.put('/categories', async (req: Request, res: Response) => {
  try {
    await writeFile(CATEGORIES_FILE, JSON.stringify({ categories: req.body }, null, 2));
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

app.get('/categories', async (req: Request, res: Response) => {
  try {
    const data = await readFile(CATEGORIES_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ categories: [] });
    } else {
        console.log(error)
      res.status(500).json({ error: 'Failed to read categories' });
    }
  }
});

app.get('/transactions/category/:description', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const match = transactions.find(t => 
      t.description.toLowerCase() === req.params['description'].toLowerCase()
    );
    res.json({ category: match?.category || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check transaction category' });
  }
});

app.get('/transactions', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const sortedTransactions = transactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    res.json({ transactions: sortedTransactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Move this endpoint before the '/:id' routes to prevent route conflicts
app.get('/transactions/match', async (req: Request, res: Response) => {
  try {
    const { date, amount, description } = req.query;

    // Debug log for incoming query parameters
    console.log('Match request received:', { date, amount, description });

    if (!date || !amount || !description) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const transactions = await getStoredTransactions();

    // Debug log for stored transactions
    console.log('Stored transactions:', transactions);

    const match = transactions.find(t => {
      // Parse and compare dates without time component
      const storedDate = new Date(t.date).toISOString().split('T')[0];
      const queryDate = new Date(date.toString()).toISOString().split('T')[0];
      const sameDate = storedDate === queryDate;

      // Compare amounts with a small tolerance for floating-point differences
      const sameAmount = Math.abs(Number(t.amount) - Number(amount)) < 0.01;

      // Normalize and compare descriptions
      const storedDesc = t.description.toLowerCase().replace(/\s+/g, '');
      const queryDesc = description.toString().toLowerCase().replace(/\s+/g, '');
      const similarDescription = storedDesc.includes(queryDesc) || queryDesc.includes(storedDesc);

      // Debug log for comparison details
      console.log('Comparing transaction:', {
        storedDate,
        queryDate,
        sameDate,
        storedAmount: t.amount,
        queryAmount: amount,
        sameAmount,
        storedDesc,
        queryDesc,
        similarDescription
      });

      return sameDate && sameAmount && similarDescription;
    });

    // Debug log for match result
    console.log('Match result:', match);

    if (match) {
      return res.json({ exists: true, category: match.category });
    } else {
      return res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error in /transactions/match:', error);
    return res.status(500).json({ error: 'Failed to check transaction match' });
  }
});

app.get('/transactions/filter', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, category, beneficiary, description } = req.query;
    let transactions = await getStoredTransactions();

    // Filter by date range
    if (startDate) {
      transactions = transactions.filter(t => 
        new Date(t.date) >= new Date(startDate.toString())
      );
    }
    if (endDate) {
      transactions = transactions.filter(t => 
        new Date(t.date) <= new Date(endDate.toString())
      );
    }

    // Filter by category
    if (category) {
      transactions = transactions.filter(t => 
        t.category.toLowerCase().includes(category.toString().toLowerCase())
      );
    }

    // Filter by beneficiary or description
    if (beneficiary || description) {
      transactions = transactions.filter(t => {
        const desc = t.description.toLowerCase();
        const matchBeneficiary = !beneficiary || desc.includes(beneficiary.toString().toLowerCase());
        const matchDescription = !description || desc.includes(description.toString().toLowerCase());
        return matchBeneficiary && matchDescription;
      });
    }

    // Sort by date, latest first
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to filter transactions' });
  }
});

app.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const filtered = transactions.filter(t => t.id !== req.params['id']);
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(filtered, null, 2));
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

app.post('/transactions', async (req: Request, res: Response) => {
  try {
    await saveTransaction(req.body);
    res.status(200).json({ message: 'Transaction saved successfully' }); // Return a valid JSON response
  } catch (error) {
    res.status(500).json({ error: 'Failed to save transaction' });
  }
});

app.put('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const index = transactions.findIndex(t => t.id === req.params['id']);
    if (index !== -1) {
      transactions[index] = { ...req.body, timestamp: new Date().toISOString() };
      await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
      res.sendStatus(200);
    } else {
      res.status(404).json({ error: 'Transaction not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
