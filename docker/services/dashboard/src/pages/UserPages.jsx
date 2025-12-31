/**
 * UserPages - Re-export from user/ directory for backward compatibility
 * 
 * This file maintains backward compatibility with existing imports.
 * All user page components are now in separate files under ./user/
 */

export {
    UserHomePage,
    UserHealthPage,
    UserLocationPage,
    UserAlertsPage,
    UserVideoPage
} from './user';
