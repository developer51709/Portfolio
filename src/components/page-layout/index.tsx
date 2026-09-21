import { ReactNode } from 'react';
import {
  AiOutlineBook,
  AiOutlineGithub,
  AiOutlineHome,
  AiOutlineShoppingCart,
} from 'react-icons/ai';
import { FaHeart } from 'react-icons/fa';

export type PageRoute =
  | ''
  | 'projects'
  | 'articles'
  | 'commissions'
  | 'sponsor'
  | 'terms'
  | 'privacy';

export const NAV_ITEMS: { label: string; route: PageRoute; icon: ReactNode }[] =
  [
    { label: 'Home', route: '', icon: <AiOutlineHome className="w-4 h-4" /> },
    {
      label: 'Projects',
      route: 'projects',
      icon: <AiOutlineGithub className="w-4 h-4" />,
    },
    {
      label: 'Articles',
      route: 'articles',
      icon: <AiOutlineBook className="w-4 h-4" />,
    },
    {
      label: 'Commissions',
      route: 'commissions',
      icon: <AiOutlineShoppingCart className="w-4 h-4" />,
    },
  ];

interface PageLayoutProps {
  route: PageRoute;
  onNavigate: (route: PageRoute) => void;
  children: ReactNode;
}

const PageLayout = ({ route, onNavigate, children }: PageLayoutProps) => (
  <>
    <nav className="sticky top-0 z-40 flex justify-center px-4 pt-4">
      <div className="glass-btn rounded-full shadow-lg flex items-center gap-1 p-1.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.route}
            onClick={() => onNavigate(item.route)}
            className={`btn btn-sm btn-ghost gap-2 rounded-full normal-case ${
              route === item.route
                ? 'bg-primary text-primary-content hover:bg-primary'
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
    <div className="relative z-10 min-h-[calc(100vh-72px)] p-4 lg:p-10">
      {children}
    </div>
    <footer className="relative z-10 text-center pb-10 text-base-content/40 text-xs">
      <div className="flex items-center justify-center gap-4 mb-2">
        <a href="#/terms" className="link link-hover">
          Terms of Service
        </a>
        <span className="text-base-content/20">·</span>
        <a href="#/privacy" className="link link-hover">
          Privacy Policy
        </a>
      </div>
      Built with React, Tailwind & Three.js
    </footer>
  </>
);

export const SponsorButton = ({
  onClick,
}: {
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="btn btn-primary glass-btn fixed bottom-6 right-6 z-50 shadow-lg gap-2 rounded-full px-5"
    aria-label="Sponsor this project"
  >
    <FaHeart className="w-4 h-4" />
    Sponsor
  </button>
);

export default PageLayout;
