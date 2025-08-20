import { CardStack, Card } from '../components/ui/CardStack';

const cards: Card[] = [
  {
    id: 1,
    name: 'Tyler Durden',
    designation: 'Manager Project Mayhem',
    content: 'The first rule of Fight Club is that you do not talk about fight club. The second rule of Fight club is that you DO NOT TALK about fight club.',
  },
  {
    id: 2,
    name: 'Manu Arora',
    designation: 'Senior Software Engineer',
    content: 'These cards are amazing, I want to use them in my project. Framer motion is a godsend ngl tbh fam 🙏',
  },
  {
    id: 3,
    name: 'Elon Musk',
    designation: 'Senior Shitposter',
    content: 'I dont like this Twitter thing, deleting it right away because yolo. Instead, I would like to call it X.com so that it can easily be confused with adult sites.',
  },
];

export default function Page() {
  return (
  <div className="flex items-center justify-center min-h-[70vh]">
      <CardStack items={cards} />
    </div>
  );
}
