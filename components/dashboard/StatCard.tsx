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
      className={`bg-white px-3 py-2 md:px-4 md:py-2 rounded shadow flex items-center gap-2 md:gap-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${isClickable ? 'cursor-pointer' : ''} min-w-[170px]`}
      onClick={onClick}
      style={{ minWidth: 170, maxWidth: '100%' }}
    >
      <div className={`rounded-full p-1 md:p-1.5 ${iconBgColor}`}>
        <Icon path={iconPath} className="w-4 h-4 md:w-5 md:h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] md:text-xs font-medium text-gray-500 truncate" title={title}>{title}</p>
        <p className="text-sm md:text-base font-bold text-gray-900 truncate" title={value}>{value}</p>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';
