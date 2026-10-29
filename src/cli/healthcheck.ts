import {
  runHealthcheck,
  checkGit,
  checkDocker,
  checkWorkspaceWriteAccess,
  getWorkspaceRoot,
} from '../../backend/src/cli/healthcheck';

export {
  runHealthcheck,
  checkGit,
  checkDocker,
  checkWorkspaceWriteAccess,
  getWorkspaceRoot,
};

// Run automatically if this is the entry script
runHealthcheck(true);
