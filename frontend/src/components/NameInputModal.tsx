import React, { useState, useEffect } from 'react';
import styles from './NameInputModal.module.css';

// Fun adjectives and nouns for random name generation
const adjectives = [
  'Amazing', 'Brave', 'Clever', 'Daring', 'Epic', 'Funky', 'Goofy',
  'Happy', 'Jazzy', 'Keen', 'Lucky', 'Mighty', 'Nimble', 'Playful',
  'Quick', 'Rad', 'Super', 'Tricky', 'Vibrant', 'Wild', 'Zany'
];

const nouns = [
  'Blob', 'Champ', 'Dude', 'Explorer', 'Fighter', 'Gamer', 'Hero',
  'Jumper', 'Knight', 'Legend', 'Ninja', 'Player', 'Racer', 'Splatter',
  'Tiger', 'Victor', 'Warrior', 'Zoomer'
];

interface NameInputModalProps {
  onNameSubmit: (name: string) => void;
  isVisible: boolean;
}

const NameInputModal: React.FC<NameInputModalProps> = ({ onNameSubmit, isVisible }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Clear form when visibility changes
    if (isVisible) {
      setName('');
      setError('');
    }
  }, [isVisible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Please enter a display name');
      return;
    }

    if (trimmedName.length < 3) {
      setError('Name must be at least 3 characters');
      return;
    }

    if (trimmedName.length > 15) {
      setError('Name must be at most 15 characters');
      return;
    }

    onNameSubmit(trimmedName);
  };

  // Generate a random name
  const generateRandomName = () => {
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    setName(`${randomAdjective}${randomNoun}`);
    setError('');
  };

  if (!isVisible) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Welcome to Blobberman!</h2>
        <p>Please enter a display name to continue.</p>

        <form onSubmit={handleSubmit} className={styles.nameForm}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
            className={styles.nameInput}
            autoFocus
          />

          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.buttonGroup}>
            <button type="button" onClick={generateRandomName} className={styles.randomButton}>
              Random Name
            </button>
            <button type="submit" className={styles.submitButton}>
              Start Playing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NameInputModal;
