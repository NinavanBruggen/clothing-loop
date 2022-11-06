//MUI
import { Popover, Typography } from "@mui/material";
import { makeStyles } from "@mui/styles";

import theme from "../util/theme";
import { useState } from "react";

interface IProps {
  message: string;
}

const PopoverOnHover: React.FC<IProps> = ({ message }: IProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const classes = makeStyles(theme as any)();

  const handlePopoverOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handlePopoverClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  return (
    <div className={classes.popoverWrapper}>
      <Typography
        aria-owns={open ? "mouse-over-popover" : undefined}
        aria-haspopup="true"
        onMouseEnter={handlePopoverOpen}
        onMouseLeave={handlePopoverClose}
      >
        <span className="feather-icon feather-icon-help-circle" />
      </Typography>
      <Popover
        id="mouse-over-popover"
        sx={{
          pointerEvents: "none",
        }}
        open={open}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        onClose={handlePopoverClose}
        disableRestoreFocus
      >
        <Typography
          className={classes.specificSpacing}
          sx={{ p: 1 }}
          style={{ maxWidth: "300px" }}
        >
          {message}
        </Typography>
      </Popover>
    </div>
  );
};

export default PopoverOnHover;
