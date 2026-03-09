import React from 'react';
import { Icon } from '../ui/Icon';

interface StatCardProps {
  title: string;
  value: string;
  iconPath: string;
  iconBgColor: string;
  description?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = React.memo(({ title, value, iconPath, iconBgColor, description, onClick }) => {
  const isClickable = !!onClick;
  return (
    <div
      className={`bg-white p-5 rounded-xl shadow-md flex items-center space-x-4 transition-all duration-300 hover:scale-105 hover:shadow-lg ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`rounded-full p-3 ${iconBgColor}`}>
        <Icon path={iconPath} className="w-7 h-7 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';
