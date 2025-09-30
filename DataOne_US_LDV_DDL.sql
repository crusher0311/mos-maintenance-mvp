CREATE TABLE `DEF_MAINTENANCE_SCHEDULE` (
  `maintenance_schedule_id` int unsigned NOT NULL AUTO_INCREMENT,
  `schedule_name` varchar(255) NOT NULL DEFAULT '',
  `schedule_description` text NOT NULL,
  PRIMARY KEY (`maintenance_schedule_id`)
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=latin1;

CREATE TABLE `DEF_MAINTENANCE` (
  `maintenance_id` int unsigned NOT NULL AUTO_INCREMENT,
  `maintenance_category` varchar(128) NOT NULL DEFAULT '',
  `maintenance_name` text NOT NULL,
  `maintenance_notes` text NOT NULL,
  PRIMARY KEY (`maintenance_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5138 DEFAULT CHARSET=latin1;

CREATE TABLE `DEF_MAINTENANCE_INTERVAL` (
  `maintenance_interval_id` int unsigned NOT NULL AUTO_INCREMENT,
  `interval_type` varchar(32) NOT NULL DEFAULT '',
  `value` float unsigned NOT NULL DEFAULT '0',
  `units` varchar(32) NOT NULL DEFAULT '',
  `initial_value` float unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`maintenance_interval_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4267 DEFAULT CHARSET=latin1;

CREATE TABLE `DEF_MAINTENANCE_OPERATING_PARAMETER` (
  `maintenance_operating_parameter_id` int NOT NULL AUTO_INCREMENT,
  `operating_parameter` text NOT NULL,
  `operating_parameter_notes` text NOT NULL,
  PRIMARY KEY (`maintenance_operating_parameter_id`)
) ENGINE=InnoDB AUTO_INCREMENT=525 DEFAULT CHARSET=latin1;

CREATE TABLE `DEF_MAINTENANCE_COMPUTER_CODE` (
  `maintenance_computer_code_id` int NOT NULL AUTO_INCREMENT,
  `computer_code` varchar(32) NOT NULL,
  PRIMARY KEY (`maintenance_computer_code_id`)
) ENGINE=InnoDB AUTO_INCREMENT=72 DEFAULT CHARSET=latin1;

CREATE TABLE `DEF_MAINTENANCE_EVENT` (
  `maintenance_event_id` int NOT NULL AUTO_INCREMENT,
  `event` varchar(255) NOT NULL,
  PRIMARY KEY (`maintenance_event_id`)
) ENGINE=InnoDB AUTO_INCREMENT=66 DEFAULT CHARSET=latin1;

CREATE TABLE `LKP_YMM_MAINTENANCE` (
  `ymm_maintenance_id` int unsigned NOT NULL AUTO_INCREMENT,
  `year` smallint NOT NULL,
  `make` varchar(24) NOT NULL,
  `model` varchar(32) NOT NULL,
  `eng_notes` varchar(128) NOT NULL,
  `trans_notes` varchar(255) NOT NULL,
  `trim_notes` mediumtext NOT NULL,
  `maintenance_schedule_id` int unsigned NOT NULL DEFAULT '0',
  `maintenance_id` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`ymm_maintenance_id`),
  KEY `ymm` (`year`,`make`,`model`)
) ENGINE=InnoDB AUTO_INCREMENT=2025767369 DEFAULT CHARSET=latin1;

CREATE TABLE `LKP_VIN_MAINTENANCE` (
  `vin_maintenance_id` int unsigned NOT NULL AUTO_INCREMENT,
  `squish` varchar(16) NOT NULL,
  `trans_notes` varchar(255) NOT NULL,
  `trim_notes` text NOT NULL,
  `maintenance_schedule_id` int unsigned NOT NULL DEFAULT '0',
  `maintenance_id` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`vin_maintenance_id`),
  KEY `squish` (`squish`)
) ENGINE=InnoDB AUTO_INCREMENT=40371698 DEFAULT CHARSET=latin1;

CREATE TABLE `LKP_VIN_MAINTENANCE_INTERVAL` (
  `vin_maintenance_interval_id` int unsigned NOT NULL AUTO_INCREMENT,
  `vin_maintenance_id` int unsigned NOT NULL DEFAULT '0',
  `maintenance_interval_id` int unsigned NOT NULL DEFAULT '0',
  `maintenance_operating_parameter_id` int NOT NULL,
  PRIMARY KEY (`vin_maintenance_interval_id`),
  KEY `vin_maintenance_id` (`vin_maintenance_id`)
) ENGINE=InnoDB AUTO_INCREMENT=74989120 DEFAULT CHARSET=latin1;

CREATE TABLE `LKP_YMM_MAINTENANCE_INTERVAL` (
  `ymm_maintenance_interval_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ymm_maintenance_id` int unsigned NOT NULL DEFAULT '0',
  `maintenance_interval_id` int unsigned NOT NULL DEFAULT '0',
  `maintenance_operating_parameter_id` int NOT NULL,
  PRIMARY KEY (`ymm_maintenance_interval_id`),
  KEY `ymm_maintenance_id` (`ymm_maintenance_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4217762904 DEFAULT CHARSET=latin1;

CREATE TABLE `LKP_YMM_MAINTENANCE_EVENT_COMPUTER_CODE` (
  `ymm_maintenance_event_computer_code_id` int NOT NULL AUTO_INCREMENT,
  `maintenance_computer_code_id` int NOT NULL,
  `maintenance_event_id` int NOT NULL,
  `ymm_maintenance_id` int NOT NULL,
  PRIMARY KEY (`ymm_maintenance_event_computer_code_id`),
  KEY `ymm_maintenance_id` (`ymm_maintenance_id`)
) ENGINE=InnoDB AUTO_INCREMENT=334696892 DEFAULT CHARSET=latin1 ROW_FORMAT=DYNAMIC;

CREATE TABLE `LKP_VIN_MAINTENANCE_EVENT_COMPUTER_CODE` (
  `vin_maintenance_event_computer_code_id` int NOT NULL AUTO_INCREMENT,
  `maintenance_computer_code_id` int NOT NULL,
  `maintenance_event_id` int NOT NULL,
  `vin_maintenance_id` int NOT NULL,
  PRIMARY KEY (`vin_maintenance_event_computer_code_id`),
  KEY `vin_maintenance_id` (`vin_maintenance_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7469583 DEFAULT CHARSET=latin1 ROW_FORMAT=DYNAMIC;

